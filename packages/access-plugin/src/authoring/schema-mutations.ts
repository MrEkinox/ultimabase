import type {
	SchemaDefinition,
	SchemaItem,
	SchemaResult,
	UltimaBaseGeneratedSchemaSurfaces,
	WhereBuilder,
} from '@ultimabase/core'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
	PluginSourceSchemaMutations,
} from '@ultimabase/core/plugin'
import type {
	AccessDecisionRule,
	AccessPolicyInput,
	AccessRule,
} from './contracts.js'

/** Exposes only the stable logical identity used to select one Access branch. */
export type SchemaMutationAccessIdentity<
	TMutation extends PluginSchemaMutationDefinition,
> = Pick<TMutation, 'authority' | 'effect' | 'kind' | 'name' | 'version'>

/** Supplies the exact custom payload to an early schema-mutation decision. */
export interface SchemaMutationOperationAccessInput<
	TMutation extends PluginSchemaMutationDefinition,
> extends AccessPolicyInput {
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

/**
 * Rules one request plugin command before loading, then checks each locked
 * original and candidate (ADR-0317).
 */
export interface SchemaMutationAccess<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> {
	/**
	 * The operation rule: every row, no row, or the rows the command may change.
	 * @example `where: ({ input }) => input.reason.length > 0`
	 */
	readonly where: AccessRule<
		TSchema,
		SchemaMutationWhereAccessInput<TSchema, TMutation>
	>
	/**
	 * Checks the locked original and the owner-resolved candidate.
	 * @example `item: ({ originalItem }) => originalItem.published`
	 */
	readonly item: AccessDecisionRule<
		SchemaMutationItemAccessInput<TSchema, TMutation>
	>
}

/** One rule for a request plugin command, or its detailed `{ where, item }` form. */
export type SchemaMutationAccessDeclaration<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> =
	| AccessRule<TSchema, SchemaMutationWhereAccessInput<TSchema, TMutation>>
	| SchemaMutationAccess<TSchema, TMutation>

type GeneratedMutationMap<TSchema extends SchemaDefinition> =
	TSchema['className'] extends keyof UltimaBaseGeneratedSchemaSurfaces
		? UltimaBaseGeneratedSchemaSurfaces[TSchema['className']] extends Readonly<{
				readonly schemaMutations: infer TMutations
			}>
			? TMutations
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

type SchemaMutationMap<
	TSchema extends SchemaDefinition,
	TSource,
> = GeneratedMutationMap<TSchema> & PluginSourceSchemaMutations<TSource>

/**
 * Projects only request-authority commands present on this schema. `TSource`
 * is the schema whose statics carry the commands (the registered schema of a
 * `SchemaRef`).
 */
export type SchemaMutationAccessMap<
	TSchema extends SchemaDefinition,
	TSource = TSchema,
> = {
	readonly [
		TCommand in keyof SchemaMutationMap<TSchema, TSource> as SchemaMutationMap<
			TSchema,
			TSource
		>[TCommand] extends PluginSchemaMutationDefinition<
			string,
			string,
			unknown,
			readonly string[],
			'request'
		>
			? TCommand
			: never
	]?: SchemaMutationMap<
		TSchema,
		TSource
	>[TCommand] extends infer TMutation extends PluginSchemaMutationDefinition
		? SchemaMutationAccessDeclaration<TSchema, TMutation>
		: never
}
