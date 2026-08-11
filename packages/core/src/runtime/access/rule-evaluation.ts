import { FrameworkError } from '../../foundation.js'
import type {
	ExecutableOperationAst,
	OperationKind,
	QueryExpressionNode,
} from '../../query/index.js'
import { traverseQueryExpression } from '../../query/filters/traversal.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	combineAccessWhereResults,
	createAccessWhere,
} from '../../schema/access/filter.js'
import type {
	AccessPlan,
	AccessRuleSource,
	CompiledAccessRule,
	FieldAccessPlan,
	SchemaAccessPlan,
} from '../../schema/access/plan.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'
import {
	appendEnforcementRowFilter,
	type EnforcementState,
} from '../enforcement/state.js'
import {
	applicationHookOwner,
	createFieldHookTarget,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	createSchemaHookTarget,
	type HookExecutionDescriptor,
} from '../hooks/execution-descriptor.js'
import type { HookExecutionRuntime } from '../hooks/execution-runtime.js'
import { readOperationQueries } from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeOperationStageInput } from '../pipeline/contracts.js'

export type AccessPhase =
	| 'access-field-read'
	| 'access-field-write'
	| 'access-filter'
	| 'access-item'
	| 'access-operation'

export interface AccessRuleIdentity {
	readonly branch: string
	readonly field?: FieldAccessPlan
	readonly phase: AccessPhase
	readonly rule: CompiledAccessRule
	readonly ruleIndex: number
	readonly schema: SchemaDefinition
}

/** Keeps public denials stable while diagnostics retain only static identity. */
export const createAccessDeniedError = (
	phase: AccessPhase,
	operation: OperationKind,
	field?: FieldAccessPlan,
): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError('PERMISSION_DENIED', `Native Access denied ${phase}.`, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: {
			...(field === undefined ? {} : { fieldPath: immutableArray(field.path) }),
			kind: 'native-access-denied',
			operation,
			phase,
		},
	})

export const readAccessSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Native Access requires a schema definition')
	}

	return schema
}

const shouldBypassMaster = (
	source: AccessRuleSource,
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
): boolean =>
	source.kind === 'plugin' &&
	source.master === 'bypass' &&
	context.access.mode === 'master'

const createRuleDescriptor = (
	identity: AccessRuleIdentity,
	operation: OperationKind,
): HookExecutionDescriptor => {
	const { rule, schema } = identity
	const owner =
		rule.source.kind === 'developer'
			? applicationHookOwner
			: createPluginHookOwner(
					rule.source.ownerPlugin,
					rule.source.localName,
					rule.source.ownerInstanceId,
				)
	const target =
		identity.field === undefined
			? createSchemaHookTarget(schema.className)
			: createFieldHookTarget(schema.className, identity.field.path)

	return createHookExecutionDescriptor({
		declarationBranch: identity.branch,
		handler: typeof rule.rule === 'function' ? rule.rule : () => rule.rule,
		handlerIndex: identity.ruleIndex,
		operationKind: operation,
		owner,
		phase: identity.phase,
		target,
	})
}

/** Executes callbacks through cancellation, recursion, and diagnostics. */
const evaluateRule = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	identity: AccessRuleIdentity,
	input: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	if (typeof identity.rule.rule === 'boolean') {
		return identity.rule.rule
	}
	const handler = identity.rule.rule

	// Plan compilation correlates each callback with its branch-specific input.
	return runtime.invoke(
		createRuleDescriptor(identity, request.operation.kind),
		request.context,
		() => handler(input as never),
	)
}

export const getEffectiveAccessRules = (
	rules: readonly CompiledAccessRule[],
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
): readonly CompiledAccessRule[] =>
	immutableArray(
		rules.filter((rule) => !shouldBypassMaster(rule.source, context)),
	)

export const assertAccessDecisionRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	rules: readonly CompiledAccessRule[],
	identity: Omit<AccessRuleIdentity, 'rule' | 'ruleIndex'>,
	input: Readonly<Record<string, unknown>>,
	defaultDecision: boolean,
): Promise<void> => {
	const effective = getEffectiveAccessRules(rules, request.context)

	if (rules.length === 0 && !defaultDecision) {
		throw createAccessDeniedError(
			identity.phase,
			request.operation.kind,
			identity.field,
		)
	}

	for (const [ruleIndex, rule] of effective.entries()) {
		const output = await evaluateRule(
			runtime,
			request,
			{ ...identity, rule, ruleIndex },
			input,
		)

		if (typeof output !== 'boolean') {
			throw new TypeError(
				`Native Access ${identity.phase} rule must return a boolean`,
			)
		}

		if (!output) {
			throw createAccessDeniedError(
				identity.phase,
				request.operation.kind,
				identity.field,
			)
		}
	}
}

const operationFilterFamily = (
	kind: OperationKind,
): keyof SchemaAccessPlan['filter'] | undefined => {
	switch (kind) {
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return 'read'
		case 'update-many':
		case 'update-one':
			return 'update'
		case 'upsert-many':
		case 'upsert-one':
			return 'upsert'
		case 'delete-many':
		case 'delete-one':
			return 'delete'
		case 'create-many':
		case 'create-one':
			return undefined
	}
}

const collectFilterFields = (
	expression: QueryExpressionNode,
	fields: Set<string>,
): void => {
	traverseQueryExpression(expression, (candidate) => {
		// Collection fields cross a dedicated item boundary; pointer traversal still
		// uses the source field filter channel before target Access runs.
		if (candidate.kind === 'relation-predicate') {
			if (
				(candidate.operator === 'is' || candidate.operator === 'is-not') &&
				typeof candidate.field === 'string'
			) {
				fields.add(candidate.field)
			}

			return 'skip'
		}

		if (typeof candidate.field === 'string') {
			fields.add(candidate.field)
		}

		return 'continue'
	})
}

export const evaluateAccessFieldReferenceRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	// Structural validation establishes the executable closed operation union.
	const operation = request.operation as unknown as ExecutableOperationAst
	const filterFields = new Set<string>()
	const orderFields = new Set<string>()

	for (const query of readOperationQueries(operation)) {
		if (query.where !== undefined) {
			collectFilterFields(query.where.expression, filterFields)
		}
		for (const order of query.ordering.orders) {
			orderFields.add(order.field)
		}
	}

	for (const [channel, fields] of [
		['filter', filterFields],
		['order', orderFields],
	] as const) {
		for (const fieldName of fields) {
			const field = plan.getField(schemaPlan.schema, [fieldName])

			if (field === undefined) {
				continue
			}

			await assertAccessDecisionRules(
				runtime,
				request,
				field.read[channel],
				{
					branch: channel,
					field,
					phase: 'access-field-read',
					schema: schemaPlan.schema,
				},
				immutableRecord({ context: request.context }),
				plan.defaults.field,
			)
		}
	}
}

/** Owns operation denial and private monotonic row-policy evaluation. */
export const evaluateAccessOperationAndFilter = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	state: EnforcementState,
): Promise<EnforcementState> => {
	await assertAccessDecisionRules(
		runtime,
		request,
		schemaPlan.operation[request.operation.kind],
		{
			branch: request.operation.kind,
			phase: 'access-operation',
			schema: schemaPlan.schema,
		},
		immutableRecord({ context: request.context }),
		plan.defaults.operation,
	)

	const family = operationFilterFamily(request.operation.kind)

	if (family === undefined) {
		return state
	}

	const rules = schemaPlan.filter[family]
	const effective = getEffectiveAccessRules(rules, request.context)
	const results: unknown[] = []

	for (const [ruleIndex, rule] of effective.entries()) {
		const result = await evaluateRule(
			runtime,
			request,
			{
				branch: family,
				phase: 'access-filter',
				rule,
				ruleIndex,
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				where: createAccessWhere(schemaPlan.schema),
			}),
		)

		if (result !== undefined) {
			results.push(result)
		}
	}

	return results.length === 0
		? state
		: appendEnforcementRowFilter(
				state,
				combineAccessWhereResults(schemaPlan.schema, results),
			)
}
