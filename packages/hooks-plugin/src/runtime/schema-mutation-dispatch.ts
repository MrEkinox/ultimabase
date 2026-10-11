import {
	materializeSchemaModel,
	Schema,
	type DatabaseMutationMaterializationSource,
	type PluginSchemaMutationOperationAst,
} from '@ultimabase/core'
import type { RequestContext } from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { SchemaHookGroup } from '../authoring/declarations.js'
import type {
	HookContributionPlan,
	SchemaHookContributionPlan,
} from './contribution-plan.js'
import {
	createSchemaHookTarget,
	type HookExecutionRuntime,
} from './execution-runtime.js'
import { collectMutationAfterItems } from './lifecycle.js'
import {
	collectHandlers,
	createInputFor,
	type PlannedHandler,
} from './planned-handlers.js'

type LogicalPair = Readonly<{ originalItem: unknown; item: unknown }>

/**
 * Runs one exact custom mutation branch (Soft Delete's `softDeleteOne`, …)
 * around its owner-resolved effect. Dispatch uses the logical command, never
 * its physical statement, so native update or delete hooks never observe it.
 */
export const createSchemaMutationHooks = (
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
) => {
	const readPlan = (
		operation: PluginSchemaMutationOperationAst,
	): SchemaHookContributionPlan => {
		const schema = operation.query.schema.definition
		if (!Schema.is(schema)) {
			throw new TypeError('Schema mutation Hooks require a declared schema')
		}
		const schemaPlan = plan.getSchema(schema)
		const descriptor = schemaPlan?.schemaMutations.get(operation.command)
		if (
			schemaPlan === undefined ||
			descriptor?.schema !== schema ||
			descriptor.mutation !== operation.mutation ||
			descriptor.owner !== operation.owner
		) {
			throw new TypeError('Schema mutation Hook identity is unavailable')
		}
		return schemaPlan
	}

	const handlersFor = (
		schemaPlan: SchemaHookContributionPlan,
		operation: PluginSchemaMutationOperationAst,
		phase: SchemaHookGroup,
	): readonly PlannedHandler[] =>
		collectHandlers(
			schemaPlan.contributions[phase === 'afterOperation' ? 'after' : 'before'],
			(declarations) =>
				declarations.mutations?.[operation.command]?.[phase]?.all ?? [],
			{
				declarationBranch: operation.command,
				operationKind: 'plugin-schema-mutation',
				phase,
				target: createSchemaHookTarget(schemaPlan.schema.className),
			},
		)

	const createBase = (
		schemaPlan: SchemaHookContributionPlan,
		operation: PluginSchemaMutationOperationAst,
		pair: LogicalPair | undefined,
		pairError: string,
	): Readonly<Record<string, unknown>> => {
		const { schema } = schemaPlan
		const originalItem = pair?.originalItem
		const item = pair?.item
		if (
			!isPlainRecord(originalItem) ||
			(item !== null && !isPlainRecord(item))
		) {
			throw new TypeError(pairError)
		}
		return {
			input: operation.input,
			item: item === null ? null : materializeSchemaModel(schema, item),
			mutation: immutableRecord({
				authority: operation.mutation.authority,
				effect: operation.mutation.effect,
				kind: operation.mutation.kind,
				name: operation.mutation.name,
				version: operation.mutation.version,
			}),
			originalItem: materializeSchemaModel(schema, originalItem),
			target: immutableRecord({ id: operation.id, schema }),
		}
	}

	const internalsOf = (operation: PluginSchemaMutationOperationAst) =>
		immutableRecord({ operation })

	return {
		before: async (
			request: RequestContext,
			operation: PluginSchemaMutationOperationAst,
		): Promise<void> => {
			const schemaPlan = readPlan(operation)
			const handlers = handlersFor(schemaPlan, operation, 'beforeOperation')
			if (handlers.length === 0) return
			const base = createBase(
				schemaPlan,
				operation,
				operation,
				'Schema mutation before Hooks require a logical item pair',
			)
			for (const handler of handlers) {
				await runtime.invoke(handler.descriptor, request, (context) =>
					// Each declaration was type-checked against this exact input when authored.
					handler.descriptor.handler(
						createInputFor(handler, schemaPlan.schema, internalsOf(operation), {
							...base,
							context,
						}) as never,
					),
				)
			}
		},
		after: async (
			request: RequestContext,
			operation: PluginSchemaMutationOperationAst,
			outcome: DatabaseMutationMaterializationSource | undefined,
		): Promise<void> => {
			const schemaPlan = readPlan(operation)
			const afterHandlers = handlersFor(schemaPlan, operation, 'afterOperation')
			const commitHandlers = handlersFor(schemaPlan, operation, 'afterCommit')
			if (afterHandlers.length === 0 && commitHandlers.length === 0) return
			if (outcome === undefined) {
				throw new TypeError(
					'Schema mutation after Hooks require one materialization',
				)
			}
			const [pair, ...remaining] = collectMutationAfterItems(outcome)
			const base = createBase(
				schemaPlan,
				operation,
				remaining.length > 0 ? undefined : pair,
				'Schema mutation after Hooks require one logical item pair',
			)
			const internals = internalsOf(operation)
			for (const handler of afterHandlers) {
				await runtime.invoke(handler.descriptor, request, (context) =>
					handler.descriptor.handler(
						createInputFor(handler, schemaPlan.schema, internals, {
							...base,
							context,
						}) as never,
					),
				)
			}
			if (commitHandlers.length > 0) {
				runtime.queueAfterCommit(
					commitHandlers,
					await runtime.captureAfterCommitScope(request),
					(handler, context) =>
						createInputFor(handler, schemaPlan.schema, internals, {
							...base,
							context,
						}),
				)
			}
		},
	}
}
