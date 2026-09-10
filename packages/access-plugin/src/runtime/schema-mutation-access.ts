import type {
	DatabaseRowFilterNode,
	PluginSchemaMutationOperationAst,
	RequestContext,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	combineAccessWhereResults,
	createAccessWhere,
} from '../authoring/filter.js'
import type {
	AccessPlan,
	SchemaAccessPlan,
	SchemaMutationAccessPlan,
} from '../authoring/plan.js'
import type { AccessExecutionRuntime } from './execution-runtime.js'
import {
	assertAccessDecisionRules,
	type AccessRuntimeRequest,
} from './rule-evaluation.js'

export interface SchemaMutationAccessRequest extends AccessRuntimeRequest {
	readonly context: RequestContext
	readonly operation: PluginSchemaMutationOperationAst
}

/** Narrows the erased protected-policy input to Core's logical custom mutation. */
export const isSchemaMutationAccessRequest = (
	request: AccessRuntimeRequest,
): request is SchemaMutationAccessRequest =>
	request.operation.kind === 'plugin-schema-mutation'

const readMutationPlan = (
	request: SchemaMutationAccessRequest,
	schemaPlan: SchemaAccessPlan,
): SchemaMutationAccessPlan => {
	const mutation = schemaPlan.schemaMutations.get(request.operation.command)
	if (
		mutation?.descriptor.mutation !== request.operation.mutation ||
		mutation.descriptor.owner !== request.operation.owner
	) {
		throw new TypeError(
			'Official Access received an unavailable schema mutation identity',
		)
	}
	return mutation
}

const operationInput = (
	request: SchemaMutationAccessRequest,
): Readonly<Record<string, unknown>> => {
	const mutation = request.operation.mutation
	return immutableRecord({
		context: request.context,
		input: request.operation.input,
		mutation: immutableRecord({
			authority: mutation.authority,
			effect: mutation.effect,
			kind: mutation.kind,
			name: mutation.name,
			version: mutation.version,
		}),
	})
}

const evaluateFilterRules = async (
	runtime: AccessExecutionRuntime,
	request: SchemaMutationAccessRequest,
	schemaPlan: SchemaAccessPlan,
	mutationPlan: SchemaMutationAccessPlan,
): Promise<DatabaseRowFilterNode | undefined> => {
	const results: unknown[] = []
	for (const [ruleIndex, rule] of mutationPlan.filter.entries()) {
		const result = await runtime.invoke(
			{
				identity: {
					branch: request.operation.command,
					phase: 'access-filter',
					rule,
					ruleIndex,
					schema: schemaPlan.schema,
				},
				operation: 'plugin-schema-mutation',
			},
			request.context,
			() =>
				typeof rule.rule === 'boolean'
					? rule.rule
					: rule.rule(
							immutableRecord({
								...operationInput(request),
								where: createAccessWhere(schemaPlan.schema),
							}) as never,
						),
		)
		if (result !== undefined) results.push(result)
	}

	return results.length === 0
		? undefined
		: combineAccessWhereResults(schemaPlan.schema, results)
}

/** Applies the exact custom operation decision and private target universe. */
export const evaluateSchemaMutationAccess = async (
	runtime: AccessExecutionRuntime,
	request: SchemaMutationAccessRequest,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<DatabaseRowFilterNode | undefined> => {
	const mutationPlan = readMutationPlan(request, schemaPlan)
	const developerRules = mutationPlan.operation.filter(
		({ source }) => source.kind === 'developer',
	)
	const providerRules = mutationPlan.operation.filter(
		({ source }) => source.kind === 'plugin',
	)
	const identity = {
		branch: request.operation.command,
		phase: 'access-operation' as const,
		schema: schemaPlan.schema,
	}

	await assertAccessDecisionRules(
		runtime,
		request,
		developerRules,
		identity,
		operationInput(request),
		plan.defaults.schemaMutations,
	)
	await assertAccessDecisionRules(
		runtime,
		request,
		providerRules,
		identity,
		operationInput(request),
		true,
	)

	return evaluateFilterRules(runtime, request, schemaPlan, mutationPlan)
}

/** Evaluates the owner-resolved candidate exactly once it becomes available. */
export const enforceSchemaMutationItemAccess = async (
	runtime: AccessExecutionRuntime,
	request: SchemaMutationAccessRequest,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	if (
		request.operation.originalItem === undefined ||
		request.operation.item === undefined
	) {
		return
	}
	const mutationPlan = readMutationPlan(request, schemaPlan)
	await assertAccessDecisionRules(
		runtime,
		request,
		mutationPlan.item,
		{
			branch: request.operation.command,
			phase: 'access-item',
			schema: schemaPlan.schema,
		},
		immutableRecord({
			...operationInput(request),
			item: request.operation.item,
			originalItem: request.operation.originalItem,
		}),
		true,
	)
}
