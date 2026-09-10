import type { QueryFieldName } from '../query/ast/contracts.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelection,
} from '../query/clauses/selection.js'
import type { OperationObjectId } from '../query/operations/contracts.js'
import type { OperationOptions } from '../query/operations/options.js'
import type {
	ExactGeneratedInclusionInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../query/query/input.js'
import type { QueryResult } from '../query/query/result.js'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
} from '../plugins/plugin-schema-mutations.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../schema/type-info.js'

/** @internal Creates the temporary direct method used before Runtime issue 2603. */
export const createUnavailableSchemaMutationMethod =
	(
		name: string,
		assertAvailable: () => void,
		persisted = true,
	): ((...arguments_: readonly unknown[]) => Promise<never>) =>
	(): Promise<never> => {
		assertAvailable()
		return Promise.reject(
			new TypeError(
				persisted
					? `Schema mutation execution is unavailable until its Runtime provider is installed: ${name}`
					: `Schema mutation ${name} requires a persisted model`,
			),
		)
	}

type MutationPayload<TMutation extends PluginSchemaMutationDefinition> =
	PluginSchemaMutationInput<TMutation>

type MutationPayloadField<TMutation extends PluginSchemaMutationDefinition> = [
	MutationPayload<TMutation>,
] extends [undefined]
	? Readonly<{ readonly input?: never }>
	: Readonly<{ readonly input: MutationPayload<TMutation> }>

type MutationProjection<
	TSchema extends SchemaTypeInfoSource,
	TSelection extends QuerySelection<TSchema> | undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = Readonly<{
	readonly select?: TSelection &
		QuerySelection<TSchema> &
		ExactQuerySelection<TSchema, TSelection> &
		LiteralQuerySelection<TSelection>
}> &
	(string extends SchemaTypeInfoFor<TSchema>['fields']
		? Readonly<{
				readonly include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
			}>
		: ExactGeneratedInclusionInput<TSchema, TInclude> &
				Readonly<{ readonly include?: TInclude }>)

type ProjectionIdentity<TSelection, TInclude> = Readonly<
	([TSelection] extends [undefined]
		? object
		: { readonly select: TSelection }) &
		([TInclude] extends [undefined] ? object : { readonly include: TInclude })
>

/** Resolves the exact selected and included result of one schema mutation. */
export type PluginSchemaMutationResult<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = QueryResult<
	TSchema,
	Extract<
		[TSelection] extends [undefined]
			? | Extract<keyof NonNullable<TInclude>, QueryFieldName<TSchema>>
				| ([TInclude] extends [undefined]
						? never
						: Extract<'id', QueryFieldName<TSchema>>)
			: QuerySelectedFieldFromInput<
					SchemaTypeInfoFor<TSchema>,
					ProjectionIdentity<TSelection, TInclude>
				>,
		QueryFieldName<TSchema>
	>,
	QueryIncludedFieldFromInput<
		SchemaTypeInfoFor<TSchema>,
		ProjectionIdentity<TSelection, TInclude>
	>
>

/** Describes one direct schema-handle mutation call. */
export type PluginSchemaMutationSchemaInput<
	TSchema extends SchemaTypeInfoSource,
	TMutation extends PluginSchemaMutationDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined =
		undefined,
> = Readonly<{ readonly id: OperationObjectId<TSchema> }> &
	MutationPayloadField<TMutation> &
	MutationProjection<TSchema, TSelection, TInclude>

/** Describes one direct persisted-model mutation call. */
export type PluginSchemaMutationModelInput<
	TSchema extends SchemaTypeInfoSource,
	TMutation extends PluginSchemaMutationDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined =
		undefined,
> = MutationPayloadField<TMutation> &
	MutationProjection<TSchema, TSelection, TInclude>

/** Exposes one exact direct mutation on an application schema handle. */
export type ApplicationSchemaMutationMethod<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = <
	const TSelection extends QuerySelection<TSchema> | undefined = undefined,
	const TInclude extends
		SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined = undefined,
>(
	input: PluginSchemaMutationSchemaInput<
		TSchema,
		TMutation,
		TSelection,
		TInclude
	>,
	options?: OperationOptions,
) => Promise<PluginSchemaMutationResult<TSchema, TSelection, TInclude>>

/** Exposes one exact direct mutation on a bound persisted-model handle. */
export type ApplicationModelSchemaMutationMethod<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = <
	const TSelection extends QuerySelection<TSchema> | undefined = undefined,
	const TInclude extends
		SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined = undefined,
>(
	...arguments_: [MutationPayload<TMutation>] extends [undefined]
		? readonly [
				input?: PluginSchemaMutationModelInput<
					TSchema,
					TMutation,
					TSelection,
					TInclude
				>,
				options?: OperationOptions,
			]
		: readonly [
				input: PluginSchemaMutationModelInput<
					TSchema,
					TMutation,
					TSelection,
					TInclude
				>,
				options?: OperationOptions,
			]
) => Promise<PluginSchemaMutationResult<TSchema, TSelection, TInclude>>
