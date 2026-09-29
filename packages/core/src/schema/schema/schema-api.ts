import type { QueryFieldName } from '../../query/ast/contracts.js'
import type { QuerySelection } from '../../query/clauses/selection.js'
import type {
	SchemaCreateManyInput,
	SchemaCreateOneInput,
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertManyInput,
	SchemaUpsertOneInput,
} from '../../query/operations/schema-commands.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type {
	ExactGeneratedFindManyInput,
	ExactGeneratedFindOneInput,
	ExactGeneratedGetInput,
	QueryBuilderInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import type { QueryResult } from '../../query/query/result.js'
import type { SchemaTypeInfo, SchemaTypeInfoCarrier } from '../type-info.js'
import type { SchemaDefinition } from './definition.js'

/** Retains only the literal projection needed to materialize one exact result. */
type SchemaProjection<TSelection, TInclude> = Readonly<
	([TSelection] extends [undefined]
		? object
		: { readonly select: TSelection }) &
		([TInclude] extends [undefined] ? object : { readonly include: TInclude })
>

/** Resolves one selected and eagerly loaded schema result. */
type SchemaReadResult<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
	TSelection,
	TInclude,
> = QueryResult<
	TSchema,
	Extract<
		QuerySelectedFieldFromInput<
			TContract,
			SchemaProjection<TSelection, TInclude>
		>,
		QueryFieldName<TSchema>
	>,
	QueryIncludedFieldFromInput<TContract, SchemaProjection<TSelection, TInclude>>
>

/** Resolves one mutation result while preserving operation-specific defaults. */
type SchemaMutationResult<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TContract> | undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
	TDefaultField extends QueryFieldName<TContract> = never,
> = QueryResult<
	TSchema,
	Extract<
		[TSelection] extends [undefined]
			? | TDefaultField
				| Extract<keyof NonNullable<TInclude>, QueryFieldName<TContract>>
				| ([TInclude] extends [undefined]
						? never
						: Extract<'id', QueryFieldName<TContract>>)
			: QuerySelectedFieldFromInput<
					TContract,
					SchemaProjection<TSelection, TInclude>
				>,
		QueryFieldName<TSchema>
	>,
	QueryIncludedFieldFromInput<TContract, SchemaProjection<TSelection, TInclude>>
>

/** Uses the resolved filter directly without retaining schema field definitions. */
type SchemaFilteredInput<TContract extends SchemaTypeInfo> = Readonly<{
	readonly where?: TContract['inputs']['where']
}>

/** Rebinds overloaded collection results when a schema command is projected onto a bound handle. */
export interface SchemaFindMany<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> {
	<
		const TSelection extends TContract['inputs']['select'] | undefined =
			undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input?: ExactGeneratedFindManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaReadResult<TContract, TSchema, TSelection, TInclude>[]
	>
	<TSelectedField extends QueryFieldName<TContract>, TIncludedField>(
		input: QueryBuilderInput<TContract, TSelectedField, TIncludedField>,
		options?: OperationOptions,
	): Promise<readonly QueryResult<TSchema, TSelectedField, TIncludedField>[]>
}

/** Public static schema operations driven directly by one resolved contract. */
export interface SchemaAPI<TContract extends SchemaTypeInfo>
	extends SchemaDefinition<TContract['key']>, SchemaTypeInfoCarrier<TContract> {
	/** Counts rows matching the resolved schema filter. */
	count(
		input?: SchemaFilteredInput<TContract>,
		options?: OperationOptions,
	): Promise<number>

	/** Creates ordered rows and returns their requested projections. */
	createMany<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input: SchemaCreateManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaMutationResult<TContract, this, TSelection, TInclude>[]
	>

	/** Creates one row and returns its requested projection. */
	createOne<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input: SchemaCreateOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection, TInclude>>

	/** Deletes ordered unique targets and always retains each result `id`. */
	deleteMany<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
	>(
		input: SchemaDeleteManyInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaMutationResult<
			TContract,
			this,
			TSelection,
			undefined,
			Extract<'id', QueryFieldName<TContract>>
		>[]
	>

	/** Deletes one unique target or returns `null` when none matches. */
	deleteOne<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
	>(
		input: SchemaDeleteOneInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection> | null>

	/** Tests whether at least one row matches the resolved schema filter. */
	exists(
		input?: SchemaFilteredInput<TContract>,
		options?: OperationOptions,
	): Promise<boolean>

	/** Reads matching rows through optional offset pagination. */
	findMany<
		const TSelection extends TContract['inputs']['select'] | undefined =
			undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input?: ExactGeneratedFindManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<readonly SchemaReadResult<TContract, this, TSelection, TInclude>[]>

	/** Executes one already-materialized immutable query without schema inference. */
	findMany<TSelectedField extends QueryFieldName<TContract>, TIncludedField>(
		input: QueryBuilderInput<TContract, TSelectedField, TIncludedField>,
		options?: OperationOptions,
	): Promise<readonly QueryResult<this, TSelectedField, TIncludedField>[]>

	/** Reads the first matching row or returns `null`. */
	findOne<
		const TSelection extends TContract['inputs']['select'] | undefined =
			undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input?: ExactGeneratedFindOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TContract, this, TSelection, TInclude> | null>

	/** Reads one required row by identifier. */
	get<
		const TSelection extends TContract['inputs']['select'] | undefined =
			undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input: ExactGeneratedGetInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TContract, this, TSelection, TInclude>>

	/** Updates ordered unique targets and always retains each result `id`. */
	updateMany<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input: SchemaUpdateManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaMutationResult<
			TContract,
			this,
			TSelection,
			TInclude,
			Extract<'id', QueryFieldName<TContract>>
		>[]
	>

	/** Updates one unique target or returns `null` when none matches. */
	updateOne<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
		const TInclude extends TContract['inputs']['include'] | undefined =
			undefined,
	>(
		input: SchemaUpdateOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection, TInclude> | null>

	/** Creates or updates ordered unique targets. */
	upsertMany<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
	>(
		input: SchemaUpsertManyInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<readonly SchemaMutationResult<TContract, this, TSelection>[]>

	/** Creates or updates one unique target. */
	upsertOne<
		const TSelection extends QuerySelection<TContract> | undefined = undefined,
	>(
		input: SchemaUpsertOneInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection>>
}
