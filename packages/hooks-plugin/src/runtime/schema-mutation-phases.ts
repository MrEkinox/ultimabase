import {
	Schema,
	materializeSchemaModel,
	type DatabaseMutationMaterializationSource,
	type PluginSchemaMutationOperationAst,
	type RequestContext,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { HookContext } from '../context/hook-context.js'
import type { HookContributionPlan } from './contribution-plan.js'
import {
	collectSchemaMutationHookHandlers,
	invokeErasedHook,
} from './contribution-execution.js'
import { createSchemaHookTarget } from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import { collectMutationAfterItems } from './materializations.js'

interface SchemaMutationHookRequest {
	readonly context: RequestContext
	readonly operation: PluginSchemaMutationOperationAst
	readonly outcome?: DatabaseMutationMaterializationSource
}

const isSchemaMutationOperation = (
	operation: unknown,
): operation is PluginSchemaMutationOperationAst =>
	isPlainRecord(operation) && operation.kind === 'plugin-schema-mutation'

/** Prevents physical update and delete statements from selecting native Hook branches. */
export const isSchemaMutationHookRequest = (
	request: Readonly<{ readonly operation: unknown }>,
): request is SchemaMutationHookRequest =>
	isSchemaMutationOperation(request.operation)

const readSchemaMutationPlan = (
	plan: HookContributionPlan,
	operation: PluginSchemaMutationOperationAst,
) => {
	const schema = operation.query.schema.definition
	if (!Schema.is(schema)) {
		throw new TypeError('Schema mutation Hooks require a declared schema')
	}
	const schemaPlan = plan.getSchema(schema)
	if (schemaPlan === undefined) {
		throw new TypeError('Schema mutation Hook identity is unavailable')
	}
	const descriptor = schemaPlan.schemaMutations.get(operation.command)
	if (
		descriptor?.schema !== schema ||
		descriptor.mutation !== operation.mutation ||
		descriptor.owner !== operation.owner
	) {
		throw new TypeError('Schema mutation Hook identity is unavailable')
	}

	return { descriptor, schemaPlan }
}

const createMutationIdentity = (operation: PluginSchemaMutationOperationAst) =>
	immutableRecord({
		authority: operation.mutation.authority,
		effect: operation.mutation.effect,
		kind: operation.mutation.kind,
		name: operation.mutation.name,
		version: operation.mutation.version,
	})

const createSchemaMutationHookInput = (
	request: SchemaMutationHookRequest,
	context: HookContext,
	originalItem: Readonly<Record<string, unknown>>,
	item: Readonly<Record<string, unknown>> | null,
) => {
	const { operation } = request
	const schema = operation.query.schema.definition

	return immutableRecord({
		context,
		input: operation.input,
		item: item === null ? null : materializeSchemaModel(schema, item),
		mutation: createMutationIdentity(operation),
		originalItem: materializeSchemaModel(schema, originalItem),
		target: immutableRecord({ id: operation.id, schema }),
	})
}

/** Runs the exact custom branch after owner resolution and before persistence. */
export const runSchemaMutationBeforeHooks = async (
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	request: SchemaMutationHookRequest,
): Promise<void> => {
	const { operation } = request
	const { schemaPlan } = readSchemaMutationPlan(plan, operation)
	const originalItem = operation.originalItem
	const item = operation.item
	if (!isPlainRecord(originalItem) || (item !== null && !isPlainRecord(item))) {
		throw new TypeError(
			'Schema mutation before Hooks require a logical item pair',
		)
	}
	const handlers = collectSchemaMutationHookHandlers(
		schemaPlan.contributions,
		'before',
		'beforeOperation',
		operation.command,
		createSchemaHookTarget(schemaPlan.schema.className),
	)

	for (const handler of handlers) {
		await invokeErasedHook(runtime, handler, request.context, (context) =>
			createSchemaMutationHookInput(request, context, originalItem, item),
		)
	}
}

/** Runs the exact custom branch over adapter-validated persisted materializations. */
export const runSchemaMutationAfterHooks = async <TResult>(
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	request: SchemaMutationHookRequest & Readonly<{ readonly result: TResult }>,
): Promise<TResult> => {
	const { operation } = request
	const { schemaPlan } = readSchemaMutationPlan(plan, operation)
	if (request.outcome === undefined) {
		throw new TypeError(
			'Schema mutation after Hooks require one materialization',
		)
	}
	const [pair, ...remaining] = collectMutationAfterItems(request.outcome)
	if (
		pair === undefined ||
		remaining.length > 0 ||
		!isPlainRecord(pair.originalItem) ||
		(pair.item !== null && !isPlainRecord(pair.item))
	) {
		throw new TypeError(
			'Schema mutation after Hooks require one logical item pair',
		)
	}
	const originalItem = pair.originalItem
	const item = pair.item
	const handlers = collectSchemaMutationHookHandlers(
		schemaPlan.contributions,
		'after',
		'afterOperation',
		operation.command,
		createSchemaHookTarget(schemaPlan.schema.className),
	)

	for (const handler of handlers) {
		await invokeErasedHook(runtime, handler, request.context, (context) =>
			createSchemaMutationHookInput(request, context, originalItem, item),
		)
	}

	return request.result
}
