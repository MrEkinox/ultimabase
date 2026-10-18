import type {
	SchemaDefinition,
	SchemaItem,
	SchemaResult,
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

/** The request-authority commands present on the statics of `TSource`. */
type RequestSchemaMutations<TSource> = {
	readonly [TCommand in keyof PluginSourceSchemaMutations<TSource> as PluginSourceSchemaMutations<TSource>[TCommand] extends PluginSchemaMutationDefinition<
		string,
		string,
		unknown,
		readonly string[],
		'request'
	>
		? TCommand
		: never]: PluginSourceSchemaMutations<TSource>[TCommand]
}

/** The operation a command alias forms: `softDeleteOne` forms `softDelete`. */
type CommandOperation<TCommand> = TCommand extends `${infer TOperation}One`
	? TOperation
	: TCommand extends `${infer TOperation}Many`
		? TOperation
		: never

/**
 * Projects one key per request plugin operation present on this schema
 * (ADR-0347): `softDelete` rules `softDeleteOne` and `softDeleteMany`, so a
 * write rule never depends on cardinality. `TSource` is the schema whose
 * statics carry the commands (the registered schema of a `SchemaRef`).
 */
export type SchemaMutationAccessMap<
	TSchema extends SchemaDefinition,
	TSource = TSchema,
> = {
	readonly [TOperation in CommandOperation<
		keyof RequestSchemaMutations<TSource>
	>]?: RequestSchemaMutations<TSource>[(
		| `${TOperation}Many`
		| `${TOperation}One`
	) &
		keyof RequestSchemaMutations<TSource>] extends infer TMutation extends
		PluginSchemaMutationDefinition
		? SchemaMutationAccessDeclaration<TSchema, TMutation>
		: never
}
