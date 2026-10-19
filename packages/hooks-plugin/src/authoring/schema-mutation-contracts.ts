import type {
	PluginSchemaMutationTarget,
	SchemaDefinition,
	SchemaItem,
	SchemaResult,
} from '@ultimabase/core'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
	PluginSourceSchemaMutations,
	SchemaRulesSource,
} from '@ultimabase/core/plugin'
import type { MaybePromise } from '@ultimabase/shared'

import type { HookContext } from '../context/hook-context.js'
import type {
	HookHandlerDeclaration,
	SchemaAfterCreateHookInput,
	SchemaAfterDeleteHookInput,
	SchemaAfterOperationHookInput,
	SchemaAfterUpdateHookInput,
	SchemaAfterUpsertHookInput,
	SchemaBeforeCreateHookInput,
	SchemaBeforeDeleteHookInput,
	SchemaBeforeOperationHookInput,
	SchemaBeforeUpdateHookInput,
	SchemaBeforeUpsertHookInput,
	SchemaOperationHook,
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

// A registered `SchemaRef<"Todo">` carries no statics: its commands come
// from the registered schema, read lazily from `.with` rules (ADR-0297).
type SchemaMutationMap<TSchema extends SchemaDefinition> =
	PluginSourceSchemaMutations<SchemaRulesSource<TSchema>>

/**
 * What an `all` hook receives for one plugin command: the command's input
 * with `kind` set to its name, so `all` can narrow on it (ADR-0318 amendment).
 */
export type SchemaMutationAllHookInput<
	TSchema extends SchemaDefinition,
	TPhase extends 'after' | 'before',
> = {
	[
		TCommand in keyof SchemaMutationMap<TSchema> & string
	]: SchemaMutationMap<TSchema>[TCommand] extends infer TMutation extends
		PluginSchemaMutationDefinition
		? (TPhase extends 'before'
				? SchemaMutationBeforeHookInput<TSchema, TMutation>
				: SchemaMutationAfterHookInput<TSchema, TMutation>) & {
				readonly kind: TCommand
			}
		: never
}[keyof SchemaMutationMap<TSchema> & string]

/** The operation a command alias forms: `softDeleteOne` forms `softDelete`. */
type CommandOperation<TCommand> = TCommand extends `${infer TOperation}One`
	? TOperation
	: TCommand extends `${infer TOperation}Many`
		? TOperation
		: never

/** The commands one plugin operation covers: its `One` and `Many` methods. */
type OperationMutations<
	TSchema extends SchemaDefinition,
	TOperation extends string,
> = SchemaMutationMap<TSchema>[(`${TOperation}Many` | `${TOperation}One`) &
	keyof SchemaMutationMap<TSchema>]

/**
 * What an operation branch receives: the input of the one-row command, or of
 * one row of the many-row command (ADR-0347).
 */
type OperationHookInput<
	TSchema extends SchemaDefinition,
	TMutation,
	TPhase extends 'after' | 'before',
> = TMutation extends PluginSchemaMutationDefinition
	? TPhase extends 'before'
		? SchemaMutationBeforeHookInput<TSchema, TMutation>
		: SchemaMutationAfterHookInput<TSchema, TMutation>
	: never

/**
 * Projects one branch per plugin operation (ADR-0347): `restore` runs for
 * `restoreOne` and for each row of `restoreMany`.
 */
type SchemaMutationOperationHooks<
	TSchema extends SchemaDefinition,
	TPhase extends 'after' | 'before',
> = {
	readonly [
		TOperation in CommandOperation<keyof SchemaMutationMap<TSchema>>
	]?: HookHandlerDeclaration<
		SchemaOperationHook<
			OperationHookInput<
				TSchema,
				OperationMutations<TSchema, TOperation>,
				TPhase
			>
		>
	>
}

type SchemaMutationBeforeOperationHooks<TSchema extends SchemaDefinition> =
	SchemaMutationOperationHooks<TSchema, 'before'>

type SchemaMutationAfterOperationHooks<TSchema extends SchemaDefinition> =
	SchemaMutationOperationHooks<TSchema, 'after'>

interface NativeSchemaBeforeOperationHooks<TSchema extends SchemaDefinition> {
	/**
	 * Runs for every create, update, upsert, delete and plugin command, before
	 * its own branch; `kind` names the operation or the command.
	 */
	readonly all?: HookHandlerDeclaration<
		SchemaOperationHook<
			| SchemaBeforeOperationHookInput<TSchema>
			| SchemaMutationAllHookInput<TSchema, 'before'>
		>
	>
	readonly create?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaBeforeCreateHookInput<TSchema>>
	>
	readonly update?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaBeforeUpdateHookInput<TSchema>>
	>
	readonly upsert?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaBeforeUpsertHookInput<TSchema>>
	>
	readonly delete?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaBeforeDeleteHookInput<TSchema>>
	>
}

/** Combines the native operations with this schema's plugin operations. */
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
	/**
	 * Runs for every create, update, upsert, delete and plugin command, before
	 * its own branch; `kind` names the operation or the command.
	 */
	readonly all?: HookHandlerDeclaration<
		SchemaOperationHook<
			| SchemaAfterOperationHookInput<TSchema>
			| SchemaMutationAllHookInput<TSchema, 'after'>
		>
	>
	readonly create?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaAfterCreateHookInput<TSchema>>
	>
	readonly update?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaAfterUpdateHookInput<TSchema>>
	>
	readonly upsert?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaAfterUpsertHookInput<TSchema>>
	>
	readonly delete?: HookHandlerDeclaration<
		SchemaOperationHook<SchemaAfterDeleteHookInput<TSchema>>
	>
}

/** Combines the native operations with this schema's plugin operations. */
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

/**
 * Runs after the transaction commits, outside it (ADR-0318): the same
 * branches and inputs as `afterOperation`.
 */
export type SchemaAfterCommitHooks<TSchema extends SchemaDefinition> =
	SchemaAfterOperationHooks<TSchema>
