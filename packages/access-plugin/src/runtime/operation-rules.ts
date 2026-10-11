import {
	normalizeLogicalFilter,
	resolveWhereInput,
	type DatabaseRowFilterNode,
	type OperationKind,
	type PluginSchemaMutationOperationAst,
	type QueryFilterNode,
	type SchemaDefinition,
	type WhereInput,
} from '@ultimabase/core'
import { WhereBuilder, type RequestContext } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	AccessOpening,
	AccessOpeningGroup,
} from '../authoring/allow-without-rule.js'
import {
	readAccessOperationGroup,
	readAccessOperationSlot,
	type AccessPlan,
	type AccessRuleSource,
	type CompiledAccessRule,
	type SchemaAccessPlan,
} from '../authoring/plan.js'
import type { AccessExecutionRuntime } from './execution-runtime.js'
import {
	createAccessDeniedError,
	evaluateRule,
	readSchemaMutationPlan,
	schemaMutationInput,
	type AccessScope,
} from './rule-evaluation.js'

const openingSource: AccessRuleSource = immutableRecord({ kind: 'developer' })
// One compiled rule per opening keeps the recursion identity of its predicate.
const openingRules = new WeakMap<AccessOpening, CompiledAccessRule>()

const readOpeningRule = (opening: AccessOpening): CompiledAccessRule => {
	let rule = openingRules.get(opening)
	if (rule === undefined) {
		rule = immutableRecord({
			location: `allowWithoutRule.${opening.key}`,
			rule: opening.rule,
			source: openingSource,
			step: 'operation' as const,
		})
		openingRules.set(opening, rule)
	}
	return rule
}

const normalizeAccessWhereResult = (
	schema: SchemaDefinition,
	result: unknown,
	location: string,
): QueryFilterNode<SchemaDefinition> => {
	if (!(result instanceof WhereBuilder) && !isPlainRecord(result)) {
		throw new TypeError(
			`Access rule ${location} must return true, false, a WhereInput or a WhereBuilder`,
		)
	}
	// `resolveWhereInput` validates the plain object exactly like public `where`.
	return resolveWhereInput(
		schema,
		result as WhereBuilder<SchemaDefinition> | WhereInput<SchemaDefinition>,
	)
}

/** How one operation's rules are evaluated. */
interface OperationRules {
	readonly branch: string
	readonly createInput: () => Readonly<Record<string, unknown>>
	/** False for create and permissions: nothing is loaded, so no filter. */
	readonly filters: boolean
	readonly opening: AccessOpening | undefined
	readonly rules: readonly CompiledAccessRule[]
}

/**
 * Evaluates one operation (ADR-0317): the developer rule, or the
 * `allowWithoutRule` opening when there is none, then every provider rule,
 * which can only narrow. Returns the AND of the row filters they returned.
 */
const evaluateOperationRules = async (
	scope: AccessScope,
	{ branch, createInput, filters, opening, rules }: OperationRules,
): Promise<DatabaseRowFilterNode | undefined> => {
	const developer = rules.filter(({ source }) => source.kind === 'developer')
	const openingRule =
		developer.length === 0 && opening !== undefined
			? readOpeningRule(opening)
			: undefined
	if (developer.length === 0 && openingRule === undefined) {
		throw createAccessDeniedError(
			'access-operation',
			scope.operation,
			undefined,
			{
				rule: `no rule for ${branch}, and allowWithoutRule does not open it`,
				schema: scope.schema.className,
			},
		)
	}
	const ordered = [
		...(openingRule === undefined ? developer : [openingRule]),
		...rules.filter(({ source }) => source.kind === 'plugin'),
	]

	const filtersByRule = new Map<
		CompiledAccessRule,
		QueryFilterNode<SchemaDefinition>
	>()
	for (const [ruleIndex, rule] of ordered.entries()) {
		const phase = rule.step === 'filter' ? 'access-filter' : 'access-operation'
		const result = await evaluateRule(
			scope,
			{ branch, phase, rule, ruleIndex, schema: scope.schema },
			createInput(),
		)
		if (result === true) continue
		if (result === false) {
			throw createAccessDeniedError(phase, scope.operation, undefined, {
				rule: rule.location,
				schema: scope.schema.className,
			})
		}
		// Openings are predicates, and nothing is loaded for create or permissions.
		if (!filters || rule === openingRule) {
			throw new TypeError(`Access rule ${rule.location} must return a boolean`)
		}
		filtersByRule.set(
			rule,
			normalizeAccessWhereResult(scope.schema, result, rule.location),
		)
	}
	// Filters keep the compiled order (provider rules first) for stable SQL.
	const results = rules.flatMap((rule) => {
		const filter = filtersByRule.get(rule)
		return filter === undefined ? [] : [filter]
	})
	if (results.length === 0) return undefined
	return normalizeLogicalFilter({
		kind: 'and',
		expressions: immutableArray(results),
	})
}

/** Applies one native operation's rules and returns its private row filter. */
export const evaluateAccessOperation = (
	scope: AccessScope,
	kind: OperationKind,
): Promise<DatabaseRowFilterNode | undefined> => {
	const { context, plan, schemaPlan } = scope
	const slot = readAccessOperationSlot(kind)
	const filters = slot !== 'create'
	return evaluateOperationRules(scope, {
		branch: slot,
		createInput: () =>
			filters
				? immutableRecord({ context, where: new WhereBuilder(scope.schema) })
				: immutableRecord({ context }),
		filters,
		opening: plan.allowWithoutRule.resolve(
			slot,
			readAccessOperationGroup(kind),
		),
		rules: schemaPlan.operation[kind],
	})
}

/** Applies one request plugin command's rules and returns its row filter. */
export const evaluateSchemaMutationAccess = (
	scope: AccessScope,
	operation: PluginSchemaMutationOperationAst,
): Promise<DatabaseRowFilterNode | undefined> => {
	const mutation = readSchemaMutationPlan(scope, operation)
	const group: AccessOpeningGroup = 'write'
	return evaluateOperationRules(scope, {
		branch: operation.command,
		createInput: () =>
			immutableRecord({
				...schemaMutationInput(scope.context, operation),
				where: new WhereBuilder(scope.schema),
			}),
		filters: true,
		opening: scope.plan.allowWithoutRule.resolve(operation.command, group),
		rules: mutation.operation,
	})
}

/**
 * Answers whether the caller holds one plugin permission on a schema
 * (ADR-0317): its rule of the same name, else only its own
 * `allowWithoutRule` key; `all`, `read` and `write` never grant it. Returns
 * `undefined` when the permission is not declared on that schema.
 */
export const evaluateAccessPermission = async (
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	context: RequestContext,
	permission: string,
): Promise<boolean | undefined> => {
	const rules = schemaPlan.permissions.get(permission)
	if (rules === undefined) return undefined
	const scope: AccessScope = {
		context,
		operation: 'schema-permission',
		plan,
		policyOperation: permission,
		runtime,
		schema: schemaPlan.schema,
		schemaPlan,
	}
	await evaluateOperationRules(scope, {
		branch: permission,
		createInput: () => immutableRecord({ context }),
		filters: false,
		opening: plan.allowWithoutRule.resolve(permission),
		rules,
	})
	return true
}
