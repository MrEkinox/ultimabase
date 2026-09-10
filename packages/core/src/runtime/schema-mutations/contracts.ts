import type { MaybePromise } from '@ultimabase/shared'

import type {
	CompiledPluginSchemaMutationDefinition,
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
} from '../../plugins/plugin-schema-mutations.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import type { QueryAst, UpdateExpressionNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'

/** Identifies the exact persisted item selected by one schema mutation. */
export interface PluginSchemaMutationTarget<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly id: string
	readonly schema: TSchema
}

/** Supplies one resolver with immutable request data and its private target projection. */
export interface PluginSchemaMutationHandlerInput<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly context: RequestContext
	readonly input: PluginSchemaMutationInput<TMutation>
	readonly originalItem: Readonly<Record<string, unknown>>
	readonly target: PluginSchemaMutationTarget<TSchema>
}

/** Restricts protocol-1 update resolvers to one plain replacement-data object. */
export interface PluginSchemaMutationUpdateEffect {
	readonly data: Readonly<Record<string, unknown>>
}

/** Maps the declared effect family to the only resolver result Core accepts. */
export type PluginSchemaMutationEffectResult<
	TMutation extends PluginSchemaMutationDefinition,
> = TMutation['effect'] extends 'update'
	? PluginSchemaMutationUpdateEffect
	: undefined

/** Resolves one owner effect without receiving Runtime or adapter authority. */
export type PluginSchemaMutationHandler<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
> = (
	input: PluginSchemaMutationHandlerInput<TMutation>,
) => MaybePromise<PluginSchemaMutationEffectResult<TMutation>>

/** Identifies one application-lifetime resolver while keeping its callback private. */
export interface PluginSchemaMutationHandlerDefinition<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
> {
	readonly kind: 'plugin-schema-mutation-handler'
	readonly mutation: TMutation
}

/** Retains one product-neutral logical mutation independently from its physical plan. */
export interface PluginSchemaMutationOperationAst {
	readonly command: string
	readonly effect:
		| Readonly<{
				readonly kind: 'delete'
		  }>
		| Readonly<{
				readonly kind: 'update'
				readonly update: UpdateExpressionNode
		  }>
		| undefined
	readonly id: string
	readonly input: unknown
	readonly item: Readonly<Record<string, unknown>> | null | undefined
	readonly kind: 'plugin-schema-mutation'
	readonly mutation: CompiledPluginSchemaMutationDefinition
	readonly originalItem: Readonly<Record<string, unknown>> | undefined
	readonly owner: CompiledSchemaMutationCommand['owner']
	readonly query: QueryAst
}
