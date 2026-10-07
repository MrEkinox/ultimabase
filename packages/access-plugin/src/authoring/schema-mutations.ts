import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
	PluginSourceSchemaMutations,
	SchemaDefinition,
	SchemaItem,
	SchemaResult,
	UltimaBaseGeneratedSchemaSurfaces,
	WhereBuilder,
	WhereInput,
} from '@ultimabase/core'
import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from '../context.js'

type SchemaMutationDecisionRule<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

/** Exposes only the stable logical identity used to select one Access branch. */
export type SchemaMutationAccessIdentity<
	TMutation extends PluginSchemaMutationDefinition,
> = Pick<TMutation, 'authority' | 'effect' | 'kind' | 'name' | 'version'>

/** Supplies the exact custom payload to an early schema-mutation decision. */
export interface SchemaMutationOperationAccessInput<
	TMutation extends PluginSchemaMutationDefinition,
> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Contains the exact payload validated by the mutation declaration. */
	readonly input: PluginSchemaMutationInput<TMutation>
	/** Identifies the logical mutation independently from its persistence plan. */
	readonly mutation: SchemaMutationAccessIdentity<TMutation>
}

/** Adds one isolated schema-aware builder to a custom target restriction. */
export interface SchemaMutationWhereAccessInput<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> extends SchemaMutationOperationAccessInput<TMutation> {
	/** Builds a private target restriction for this schema only. */
	readonly where: WhereBuilder<TSchema>
}

/** Correlates the locked preimage with the owner-resolved logical candidate. */
export interface SchemaMutationItemAccessInput<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> extends SchemaMutationOperationAccessInput<TMutation> {
	/** Contains the owner-resolved candidate, or null for a delete effect. */
	readonly item: TMutation['effect'] extends 'update'
		? Readonly<SchemaItem<TSchema>>
		: null
	/** Contains the immutable locked target before the owner effect. */
	readonly originalItem: SchemaResult<TSchema>
}

/** Restricts rows eligible for one exact plugin-owned schema mutation. */
export type SchemaMutationWhereRule<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> =
	| WhereInput<TSchema>
	| ((
			input: SchemaMutationWhereAccessInput<TSchema, TMutation>,
	  ) => MaybePromise<WhereBuilder<TSchema> | WhereInput<TSchema> | undefined>)

/** Groups every monotonic decision for one exact custom logical mutation. */
export interface SchemaMutationAccess<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> {
	/** Makes the early decision before Core loads the target. */
	readonly allow?: SchemaMutationDecisionRule<
		SchemaMutationOperationAccessInput<TMutation>
	>
	/** Restricts the private row universe eligible for the mutation. */
	readonly where?: SchemaMutationWhereRule<TSchema, TMutation>
	/** Checks the locked original and owner-resolved logical candidate. */
	readonly item?: SchemaMutationDecisionRule<
		SchemaMutationItemAccessInput<TSchema, TMutation>
	>
}

/** Allows one concise decision or the complete custom mutation stages. */
export type SchemaMutationAccessDeclaration<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> =
	| SchemaMutationDecisionRule<SchemaMutationOperationAccessInput<TMutation>>
	| SchemaMutationAccess<TSchema, TMutation>

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

/** Projects only request-authority commands present on this generated schema. */
export type SchemaMutationAccessMap<TSchema extends SchemaDefinition> = {
	readonly [
		TCommand in keyof SchemaMutationMap<TSchema> as SchemaMutationMap<TSchema>[TCommand] extends PluginSchemaMutationDefinition<
			string,
			string,
			unknown,
			readonly string[],
			'request'
		>
			? TCommand
			: never
	]?: SchemaMutationMap<TSchema>[TCommand] extends infer TMutation extends
		PluginSchemaMutationDefinition
		? SchemaMutationAccessDeclaration<TSchema, TMutation>
		: never
}
