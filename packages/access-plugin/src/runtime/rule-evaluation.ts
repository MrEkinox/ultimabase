import {
	FrameworkError,
	Schema,
	WhereBuilder,
	getOperationSchema,
	normalizeLogicalFilter,
	readOperationQueries,
	resolveWhereInput,
	traverseQueryExpression,
	type DatabaseOperationAst,
	type DatabaseRowFilterNode,
	type ExecutableOperationAst,
	type OperationKind,
	type PluginSchemaMutationOperationAst,
	type QueryFilterNode,
	type RequestContext,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
	type WhereInput,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	readAccessOperationDefault,
	readAccessOperationFamily,
	type AccessPlan,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
	type SchemaMutationAccessPlan,
} from '../authoring/plan.js'
import type {
	AccessExecutionRuntime,
	AccessOperationKind,
	AccessPhase,
	AccessRuleIdentity,
} from './execution-runtime.js'

/** Carries the request facts shared by every rule evaluated at one boundary. */
export interface RuleScope {
	readonly context: RequestContext
	readonly operation: AccessOperationKind
	readonly runtime: AccessExecutionRuntime
	readonly schema: SchemaDefinition
}

/** Adds the compiled plan of the operation schema to one rule scope. */
export interface AccessScope extends RuleScope {
	readonly plan: AccessPlan
	readonly schemaPlan: SchemaAccessPlan
}

/** Names the policy boundary of one rule list without its rule position. */
export interface RuleTarget {
	readonly branch: string
	readonly field?: FieldAccessPlan
	readonly phase: AccessPhase
}

/** Keeps public denials stable while diagnostics retain only static identity. */
export const createAccessDeniedError = (
	phase: AccessPhase,
	operation: AccessOperationKind,
	field?: FieldAccessPlan,
): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError('PERMISSION_DENIED', `Native Access denied ${phase}.`, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: {
			...(field === undefined ? {} : { fieldPath: immutableArray(field.path) }),
			kind: 'access-rule-denied',
			operation,
			phase,
		},
	})

/** Reads the exact compiled schema plan or fails closed for a foreign graph. */
export const requireAccessSchemaPlan = (
	plan: AccessPlan,
	operation: RuntimeLogicalOperationAst,
): SchemaAccessPlan => {
	const schema: unknown = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Native Access requires a schema definition')
	}
	const schemaPlan = plan.getSchema(schema)
	if (schemaPlan === undefined) {
		throw new TypeError('Native Access plan does not own the operation schema')
	}
	return schemaPlan
}

/** Binds one request to the compiled plan of its operation schema. */
export const createAccessScope = (
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	context: RequestContext,
	operation: RuntimeLogicalOperationAst,
): AccessScope => {
	const schemaPlan = requireAccessSchemaPlan(plan, operation)
	return {
		context,
		operation: operation.kind,
		plan,
		runtime,
		schema: schemaPlan.schema,
		schemaPlan,
	}
}

/** Exposes the operation details Core proved during structural validation. */
export const readExecutableOperation = (
	operation: DatabaseOperationAst,
): ExecutableOperationAst =>
	// Core validates every native operation into this closed union before
	// Runtime stages run; its own operation readers rely on the same proof.
	operation as unknown as ExecutableOperationAst

/**
 * Evaluates one rule. Static booleans skip the callback runtime unless
 * `invokeStatic` asks for the same diagnostics and cancellation as callbacks.
 */
const evaluateRule = (
	scope: RuleScope,
	identity: AccessRuleIdentity,
	input: Readonly<Record<string, unknown>>,
	invokeStatic = false,
): unknown => {
	const rule = identity.rule.rule
	if (typeof rule === 'boolean' && !invokeStatic) return rule
	return scope.runtime.invoke(
		immutableRecord({ identity, operation: scope.operation }),
		scope.context,
		// Plan compilation correlates each callback with its branch-specific input.
		() => (typeof rule === 'boolean' ? rule : rule(input as never)),
	)
}

/**
 * Requires every rule to return `true`. An empty list allows unless
 * `allowWhenEmpty` is false, which is how fail-closed defaults deny.
 */
export const assertAccessRules = async (
	scope: RuleScope,
	rules: readonly CompiledAccessRule[],
	target: RuleTarget,
	input: Readonly<Record<string, unknown>>,
	allowWhenEmpty = true,
): Promise<void> => {
	if (rules.length === 0 && !allowWhenEmpty) {
		throw createAccessDeniedError(target.phase, scope.operation, target.field)
	}
	for (const [ruleIndex, rule] of rules.entries()) {
		const output = await evaluateRule(
			scope,
			{ ...target, rule, ruleIndex, schema: scope.schema },
			input,
		)
		if (typeof output !== 'boolean') {
			throw new TypeError(
				`Native Access ${target.phase} rule must return a boolean`,
			)
		}
		if (!output) {
			throw createAccessDeniedError(target.phase, scope.operation, target.field)
		}
	}
}

/**
 * Lets developer rules apply the configured default, then lets provider rules
 * only deny. `createInput` runs once per group.
 */
const assertOperationRules = async (
	scope: AccessScope,
	rules: readonly CompiledAccessRule[],
	branch: string,
	createInput: () => Readonly<Record<string, unknown>>,
	defaultDecision: boolean,
): Promise<void> => {
	const target = { branch, phase: 'access-operation' as const }
	const developerRules = rules.filter(
		({ source }) => source.kind === 'developer',
	)
	const providerRules = rules.filter(({ source }) => source.kind === 'plugin')
	await assertAccessRules(
		scope,
		developerRules,
		target,
		createInput(),
		defaultDecision,
	)
	await assertAccessRules(scope, providerRules, target, createInput())
}

const normalizeAccessWhereResult = (
	schema: SchemaDefinition,
	result: unknown,
): QueryFilterNode<SchemaDefinition> => {
	if (!(result instanceof WhereBuilder) && !isPlainRecord(result)) {
		throw new TypeError(
			'Access where must return undefined, a WhereInput, or a WhereBuilder',
		)
	}
	// `resolveWhereInput` validates the plain object exactly like public `where`.
	return resolveWhereInput(
		schema,
		result as WhereBuilder<SchemaDefinition> | WhereInput<SchemaDefinition>,
	)
}

/** ANDs independent row restrictions so no later contribution can broaden rows. */
const evaluateFilters = async (
	scope: AccessScope,
	rules: readonly CompiledAccessRule[],
	branch: string,
	createInput: () => Readonly<Record<string, unknown>>,
	invokeStatic?: boolean,
): Promise<DatabaseRowFilterNode | undefined> => {
	const results: unknown[] = []
	for (const [ruleIndex, rule] of rules.entries()) {
		const result = await evaluateRule(
			scope,
			{ branch, phase: 'access-filter', rule, ruleIndex, schema: scope.schema },
			createInput(),
			invokeStatic,
		)
		if (result !== undefined) results.push(result)
	}
	if (results.length === 0) return undefined
	return normalizeLogicalFilter({
		kind: 'and',
		expressions: immutableArray(
			results.map((result) => normalizeAccessWhereResult(scope.schema, result)),
		),
	})
}

/** Applies the native operation decision and returns its private row filter. */
export const evaluateAccessOperation = async (
	scope: AccessScope,
	kind: OperationKind,
): Promise<DatabaseRowFilterNode | undefined> => {
	const { context, plan, schemaPlan } = scope
	const input = immutableRecord({ context })
	await assertOperationRules(
		scope,
		schemaPlan.operation[kind],
		kind,
		() => input,
		readAccessOperationDefault(plan.defaults, kind),
	)
	const family = readAccessOperationFamily(kind)
	if (family === 'create') return undefined
	return evaluateFilters(scope, schemaPlan.filter[family], family, () =>
		immutableRecord({ context, where: new WhereBuilder(scope.schema) }),
	)
}

/** Checks the exact field references of where and orderBy clauses. */
export const evaluateAccessFieldReferenceRules = async (
	scope: AccessScope,
	operation: DatabaseOperationAst,
): Promise<void> => {
	const filterFields = new Set<string>()
	const orderFields = new Set<string>()
	for (const query of readOperationQueries(operation)) {
		if (query.where !== undefined) {
			traverseQueryExpression(query.where.expression, (candidate) => {
				// Collection fields cross a dedicated item boundary; pointer traversal
				// still uses the source field filter channel before target Access runs.
				if (candidate.kind === 'relation-predicate') {
					if (
						(candidate.operator === 'is' || candidate.operator === 'is-not') &&
						typeof candidate.field === 'string'
					) {
						filterFields.add(candidate.field)
					}
					return 'skip'
				}
				if (typeof candidate.field === 'string') {
					filterFields.add(candidate.field)
				}
				return 'continue'
			})
		}
		for (const order of query.ordering.orders) orderFields.add(order.field)
	}

	for (const [channel, fields] of [
		['filter', filterFields],
		['order', orderFields],
	] as const) {
		for (const fieldName of fields) {
			const field = scope.plan.getField(scope.schema, [fieldName])
			if (field === undefined) continue
			await assertAccessRules(
				scope,
				field.read[channel],
				{ branch: channel, field, phase: 'access-field-read' },
				immutableRecord({ context: scope.context }),
			)
		}
	}
}

const readSchemaMutationPlan = (
	scope: AccessScope,
	operation: PluginSchemaMutationOperationAst,
): SchemaMutationAccessPlan => {
	const mutation = scope.schemaPlan.schemaMutations.get(operation.command)
	if (
		mutation?.descriptor.mutation !== operation.mutation ||
		mutation.descriptor.owner !== operation.owner
	) {
		throw new TypeError(
			'Official Access received an unavailable schema mutation identity',
		)
	}
	return mutation
}

const schemaMutationInput = (
	context: RequestContext,
	operation: PluginSchemaMutationOperationAst,
): Readonly<Record<string, unknown>> => {
	const { authority, effect, kind, name, version } = operation.mutation
	return immutableRecord({
		context,
		input: operation.input,
		mutation: immutableRecord({ authority, effect, kind, name, version }),
	})
}

/** Applies the exact custom operation decision and private target universe. */
export const evaluateSchemaMutationAccess = async (
	scope: AccessScope,
	operation: PluginSchemaMutationOperationAst,
): Promise<DatabaseRowFilterNode | undefined> => {
	const mutation = readSchemaMutationPlan(scope, operation)
	const createInput = () => schemaMutationInput(scope.context, operation)
	await assertOperationRules(
		scope,
		mutation.operation,
		operation.command,
		createInput,
		scope.plan.defaults.schemaMutations,
	)
	// Custom filters always run through the callback runtime, even when static.
	return evaluateFilters(
		scope,
		mutation.filter,
		operation.command,
		() =>
			immutableRecord({
				...createInput(),
				where: new WhereBuilder(scope.schema),
			}),
		true,
	)
}

/** Evaluates the owner-resolved candidate once it becomes available. */
export const enforceSchemaMutationItemAccess = async (
	scope: AccessScope,
	operation: PluginSchemaMutationOperationAst,
): Promise<void> => {
	const { item, originalItem } = operation
	if (originalItem === undefined || item === undefined) return
	await assertAccessRules(
		scope,
		readSchemaMutationPlan(scope, operation).item,
		{ branch: operation.command, phase: 'access-item' },
		immutableRecord({
			...schemaMutationInput(scope.context, operation),
			item,
			originalItem,
		}),
	)
}
