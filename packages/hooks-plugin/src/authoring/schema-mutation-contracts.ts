import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
	PluginSchemaMutationTarget,
	PluginSourceSchemaMutations,
	SchemaDefinition,
	SchemaItem,
	SchemaResult,
	UltimaBaseGeneratedSchemaSurfaces,
} from '@ultimabase/core'
import type { MaybePromise } from '@ultimabase/shared'

import type { HookContext } from '../context/hook-context.js'
import type {
	HookHandlerDeclaration,
	SchemaAfterCreateHook,
	SchemaAfterDeleteHook,
	SchemaAfterUpdateHook,
	SchemaAfterUpsertHook,
	SchemaBeforeCreateHook,
	SchemaBeforeDeleteHook,
	SchemaBeforeUpdateHook,
} from './contracts.js'

/** Exposes only the stable logical identity used to select one custom Hook branch. */
export type SchemaMutationHookIdentity<
	TMutation extends PluginSchemaMutationDefinition,
> = Pick<TMutation, 'authority' | 'effect' | 'kind' | 'name' | 'version'>

/** Supplies the validated logical pair immediately before custom persistence. */
export interface SchemaMutationBeforeHookInput<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Contains the exact payload validated by the mutation declaration. */
	readonly input: PluginSchemaMutationInput<TMutation>
	/** Contains the owner-resolved candidate, or null for a delete effect. */
	readonly item: TMutation['effect'] extends 'update'
		? Readonly<SchemaItem<TSchema>>
		: null
	/** Identifies the logical mutation independently from its persistence plan. */
	readonly mutation: SchemaMutationHookIdentity<TMutation>
	/** Contains the immutable locked target before the owner effect. */
	readonly originalItem: SchemaResult<TSchema>
	/** Identifies the exact application schema and object selected by the command. */
	readonly target: PluginSchemaMutationTarget<TSchema>
}

/** Supplies the persisted logical pair after custom persistence and before commit. */
export interface SchemaMutationAfterHookInput<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> extends Omit<SchemaMutationBeforeHookInput<TSchema, TMutation>, 'item'> {
	/** Contains the validated persisted result, or null for a delete effect. */
	readonly item: TMutation['effect'] extends 'update'
		? SchemaResult<TSchema>
		: null
}

/** Observes or rejects one exact custom mutation before persistence. */
export type SchemaMutationBeforeHook<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = (
	input: SchemaMutationBeforeHookInput<TSchema, TMutation>,
) => MaybePromise<void>

/** Observes or rejects one exact custom mutation after persistence and before commit. */
export type SchemaMutationAfterHook<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = (
	input: SchemaMutationAfterHookInput<TSchema, TMutation>,
) => MaybePromise<void>

type GeneratedMutationMap<TSchema extends SchemaDefinition> =
	TSchema['className'] extends keyof UltimaBaseGeneratedSchemaSurfaces
		? UltimaBaseGeneratedSchemaSurfaces[TSchema['className']] extends Readonly<{
				readonly schemaMutations: infer TMutations
			}>
			? TMutations
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

type SchemaMutationMap<TSchema extends SchemaDefinition> =
	GeneratedMutationMap<TSchema> & PluginSourceSchemaMutations<TSchema>

/** Projects exact custom before-operation branches from the generated graph. */
type SchemaMutationBeforeOperationHooks<TSchema extends SchemaDefinition> = {
	readonly [
		TCommand in keyof SchemaMutationMap<TSchema>
	]?: SchemaMutationMap<TSchema>[TCommand] extends infer TMutation extends
		PluginSchemaMutationDefinition
		? HookHandlerDeclaration<SchemaMutationBeforeHook<TSchema, TMutation>>
		: never
}

/** Projects exact custom after-operation branches from the generated graph. */
type SchemaMutationAfterOperationHooks<TSchema extends SchemaDefinition> = {
	readonly [
		TCommand in keyof SchemaMutationMap<TSchema>
	]?: SchemaMutationMap<TSchema>[TCommand] extends infer TMutation extends
		PluginSchemaMutationDefinition
		? HookHandlerDeclaration<SchemaMutationAfterHook<TSchema, TMutation>>
		: never
}

interface NativeSchemaBeforeOperationHooks<TSchema extends SchemaDefinition> {
	readonly create?: HookHandlerDeclaration<SchemaBeforeCreateHook<TSchema>>
	readonly update?: HookHandlerDeclaration<SchemaBeforeUpdateHook<TSchema>>
	readonly delete?: HookHandlerDeclaration<SchemaBeforeDeleteHook<TSchema>>
}

/** Combines native lifecycle names with this application's exact schema mutations. */
export type SchemaBeforeOperationHooks<TSchema extends SchemaDefinition> =
	Readonly<{
		[
			TKey in
				| keyof NativeSchemaBeforeOperationHooks<TSchema>
				| keyof SchemaMutationBeforeOperationHooks<TSchema>
		]?: TKey extends keyof NativeSchemaBeforeOperationHooks<TSchema>
			? Exclude<NativeSchemaBeforeOperationHooks<TSchema>[TKey], undefined>
			: TKey extends keyof SchemaMutationBeforeOperationHooks<TSchema>
				? Exclude<SchemaMutationBeforeOperationHooks<TSchema>[TKey], undefined>
				: never
	}>

interface NativeSchemaAfterOperationHooks<TSchema extends SchemaDefinition> {
	readonly create?: HookHandlerDeclaration<SchemaAfterCreateHook<TSchema>>
	readonly update?: HookHandlerDeclaration<SchemaAfterUpdateHook<TSchema>>
	readonly upsert?: HookHandlerDeclaration<SchemaAfterUpsertHook<TSchema>>
	readonly delete?: HookHandlerDeclaration<SchemaAfterDeleteHook<TSchema>>
}

/** Combines native lifecycle names with this application's exact schema mutations. */
export type SchemaAfterOperationHooks<TSchema extends SchemaDefinition> =
	Readonly<{
		[
			TKey in
				| keyof NativeSchemaAfterOperationHooks<TSchema>
				| keyof SchemaMutationAfterOperationHooks<TSchema>
		]?: TKey extends keyof NativeSchemaAfterOperationHooks<TSchema>
			? Exclude<NativeSchemaAfterOperationHooks<TSchema>[TKey], undefined>
			: TKey extends keyof SchemaMutationAfterOperationHooks<TSchema>
				? Exclude<SchemaMutationAfterOperationHooks<TSchema>[TKey], undefined>
				: never
	}>
