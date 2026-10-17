import {
	FrameworkError,
	Schema,
	getOperationSchema,
	getRequestPrincipal,
	readOperationQueries,
	traverseQueryExpression,
	type DatabaseOperationAst,
	type ExecutableOperationAst,
	type PluginSchemaMutationOperationAst,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readAccessOperationSlot,
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
import type { RequestContext } from '@ultimabase/core/plugin'

/** Carries the request facts shared by every rule evaluated at one boundary. */
export interface RuleScope {
	readonly context: RequestContext
	readonly operation: AccessOperationKind
	/** The policy operation key rules receive (`update`, `softDeleteOne`…). */
	readonly policyOperation: string
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

/** Where one denial happened, for the server-side diagnostic line (ADR-0317). */
export interface AccessDenialSite {
	/** Where the deciding rule is declared, or why no rule allowed. */
	readonly rule: string
	readonly schema: string
}

/** Keeps public denials stable; internal details name the denying rule. */
export const createAccessDeniedError = (
	phase: AccessPhase,
	operation: AccessOperationKind,
	field?: FieldAccessPlan,
	site?: AccessDenialSite,
): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError('PERMISSION_DENIED', `Native Access denied ${phase}.`, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: {
			...(field === undefined ? {} : { fieldPath: immutableArray(field.path) }),
			kind: 'access-rule-denied',
			operation,
			phase,
			...(site === undefined ? {} : { rule: site.rule, schema: site.schema }),
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

/** Names the policy operation key a rule receives (`update`, `softDeleteOne`…). */
export const readPolicyOperation = (
	operation: RuntimeLogicalOperationAst,
): string =>
	operation.kind === 'plugin-schema-mutation'
		? operation.command
		: readAccessOperationSlot(operation.kind)

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
		policyOperation: readPolicyOperation(operation),
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
export const evaluateRule = async (
	scope: RuleScope,
	identity: AccessRuleIdentity,
	input: Readonly<Record<string, unknown>>,
	invokeStatic = false,
): Promise<unknown> => {
	const rule = identity.rule.rule
	if (typeof rule === 'boolean' && !invokeStatic) return rule
	// Every rule receives the Core policy context (ADR-0304); Core resolves the
	// principal at most once per request, before the first rule reading it.
	const policyInput =
		typeof rule === 'boolean'
			? input
			: immutableRecord({
					...input,
					operation: scope.policyOperation,
					principal: await getRequestPrincipal(scope.context),
					schema: scope.schema.className,
				})
	return scope.runtime.invoke(
		immutableRecord({ identity, operation: scope.operation }),
		scope.context,
		// Plan compilation correlates each callback with its branch-specific input.
		() => (typeof rule === 'boolean' ? rule : rule(policyInput as never)),
	)
}

/** Requires every rule to return `true`; an empty list restricts nothing. */
export const assertAccessRules = async (
	scope: RuleScope,
	rules: readonly CompiledAccessRule[],
	target: RuleTarget,
	input: Readonly<Record<string, unknown>>,
): Promise<void> => {
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
			throw createAccessDeniedError(
				target.phase,
				scope.operation,
				target.field,
				{ rule: rule.location, schema: scope.schema.className },
			)
		}
	}
}

/**
 * Checks the exact field references of where and orderBy clauses, including
 * the targeting filter of a plugin command (ADR-0316 decision 6, ADR-0344).
 */
export const evaluateAccessFieldReferenceRules = async (
	scope: AccessScope,
	operation: RuntimeLogicalOperationAst,
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

/** Reads the compiled rules of one request plugin command. */
export const readSchemaMutationPlan = (
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

/** The input of a command rule: the command's validated `input` and identity. */
export const schemaMutationInput = (
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
