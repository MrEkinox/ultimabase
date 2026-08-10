import type { QueryFieldName } from '../../query/ast/contracts.js'
import type {
	QuerySelectedField,
	QuerySelection,
} from '../../query/clauses/selection.js'
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
	ExactCursorFindManyInput,
	ExactGeneratedFindOneInput,
	ExactGeneratedGetInput,
	ExactOffsetFindManyInput,
	ExactReadInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import type { QueryResult } from '../../query/query/result.js'
import type {
	HasUltimaBaseGeneratedRegistry,
	SchemaTypeInfo,
	SchemaTypeInfoCarrier,
} from '../type-info.js'
import type { SchemaDefinition } from './definition.js'

type SchemaMutationKind =
	| 'create-many'
	| 'create-one'
	| 'delete-many'
	| 'delete-one'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

type SchemaMutationInput<
	TContract extends SchemaTypeInfo,
	TKind extends SchemaMutationKind,
	TSelection extends QuerySelection<TContract> | undefined = undefined,
> = TKind extends 'create-one'
	? SchemaCreateOneInput<TContract, TSelection>
	: TKind extends 'create-many'
		? SchemaCreateManyInput<TContract, TSelection>
		: TKind extends 'update-one'
			? SchemaUpdateOneInput<TContract, TSelection>
			: TKind extends 'update-many'
				? SchemaUpdateManyInput<TContract, TSelection>
				: TKind extends 'upsert-one'
					? SchemaUpsertOneInput<TContract, TSelection>
					: TKind extends 'upsert-many'
						? SchemaUpsertManyInput<TContract, TSelection>
						: TKind extends 'delete-one'
							? SchemaDeleteOneInput<TContract, TSelection>
							: SchemaDeleteManyInput<TContract, TSelection>

type SchemaMutationSelectedField<
	TContract extends SchemaTypeInfo,
	TKind extends SchemaMutationKind,
	TSelection,
> = [TSelection] extends [QuerySelection<TContract>]
	? Extract<
			QuerySelectedField<TContract, TSelection>,
			QueryFieldName<TContract>
		>
	: TKind extends 'delete-many' | 'update-many'
		? Extract<'id', QueryFieldName<TContract>>
		: never

type SchemaMutationResult<
	TContract extends SchemaTypeInfo,
	TKind extends SchemaMutationKind,
	TSelection,
	TSchema extends SchemaDefinition,
> = TKind extends 'create-many' | 'delete-many' | 'update-many' | 'upsert-many'
	? readonly QueryResult<
			TSchema,
			Extract<
				SchemaMutationSelectedField<TContract, TKind, TSelection>,
				QueryFieldName<TSchema>
			>
		>[]
	: TKind extends 'delete-one' | 'update-one'
		? QueryResult<
				TSchema,
				Extract<
					SchemaMutationSelectedField<TContract, TKind, TSelection>,
					QueryFieldName<TSchema>
				>
			> | null
		: QueryResult<
				TSchema,
				Extract<
					SchemaMutationSelectedField<TContract, TKind, TSelection>,
					QueryFieldName<TSchema>
				>
			>

type SchemaFindManyResult<
	TSchema extends SchemaDefinition,
	TSelection,
	TInclude,
> = Promise<
	readonly QueryResult<
		TSchema,
		QuerySelectedFieldFromInput<
			TSchema,
			SchemaFindManyProjection<TSelection, TInclude>
		>,
		QueryIncludedFieldFromInput<
			TSchema,
			SchemaFindManyProjection<TSelection, TInclude>
		>
	>[]
>

type SchemaReadResult<
	TSchema extends SchemaDefinition,
	TSelection,
	TInclude,
> = QueryResult<
	TSchema,
	QuerySelectedFieldFromInput<
		TSchema,
		SchemaFindManyProjection<TSelection, TInclude>
	>,
	QueryIncludedFieldFromInput<
		TSchema,
		SchemaFindManyProjection<TSelection, TInclude>
	>
>

type SchemaGeneratedInclude<TContract extends SchemaTypeInfo> =
	TContract['inputs'] extends { readonly include: infer TInclude }
		? TInclude
		: never

type SchemaFindManyProjection<TSelection, TInclude> = Readonly<
	([TSelection] extends [undefined]
		? object
		: { readonly select: TSelection }) &
		([TInclude] extends [undefined] ? object : { readonly include: TInclude })
>

type GeneratedCursorFindManyInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends SchemaGeneratedInclude<TContract> | undefined,
> = HasUltimaBaseGeneratedRegistry extends true
	? ExactCursorFindManyInput<TContract, TSelection, TInclude>
	: never

type GeneratedOffsetFindManyInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends SchemaGeneratedInclude<TContract> | undefined,
> = HasUltimaBaseGeneratedRegistry extends true
	? ExactOffsetFindManyInput<TContract, TSelection, TInclude>
	: never

type BootstrapFindManyInput<
	TSchema extends SchemaDefinition,
	TInput,
> = HasUltimaBaseGeneratedRegistry extends true
	? never
	: ExactReadInput<TSchema, TInput, FindManyInput<TSchema>>

type GeneratedFindOneInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends SchemaGeneratedInclude<TContract> | undefined,
> = HasUltimaBaseGeneratedRegistry extends true
	? ExactGeneratedFindOneInput<TContract, TSelection, TInclude>
	: never

type GeneratedGetInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends SchemaGeneratedInclude<TContract> | undefined,
> = HasUltimaBaseGeneratedRegistry extends true
	? ExactGeneratedGetInput<TContract, TSelection, TInclude>
	: never

type BootstrapFindOneInput<
	TSchema extends SchemaDefinition,
	TInput,
> = HasUltimaBaseGeneratedRegistry extends true
	? never
	: ExactReadInput<TSchema, TInput, FindOneInput<TSchema>>

type BootstrapGetInput<
	TSchema extends SchemaDefinition,
	TInput,
> = HasUltimaBaseGeneratedRegistry extends true
	? never
	: ExactReadInput<TSchema, TInput, GetInput<TSchema>>

/** Uses the generated filter directly without retaining schema field definitions. */
type SchemaFilteredInput<TContract extends SchemaTypeInfo> = Readonly<{
	readonly where?: TContract['inputs']['where']
}>

/** Executes one generated mutation kind without reconstructing schema fields. */
export interface SchemaMutationMethod<
	TContract extends SchemaTypeInfo,
	TKind extends SchemaMutationKind,
	TSchema extends SchemaDefinition,
> {
	/** Executes this mutation and returns the requested generated projection. */
	<const TSelection extends QuerySelection<TContract>>(
		input: SchemaMutationInput<TContract, TKind, TSelection>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, TKind, TSelection, TSchema>>
	/** Executes this mutation with its generated default projection. */
	(
		input: SchemaMutationInput<TContract, TKind>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, TKind, undefined, TSchema>>
}

/** Executes one generated collection read with its exact selected result. */
export interface SchemaFindManyMethod<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> {
	/** Reads matching rows with exact field and eager projections. */
	<
		const TSelection extends TContract['inputs']['select'],
		const TInclude extends SchemaGeneratedInclude<TContract>,
	>(
		input: GeneratedCursorFindManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, TSelection, TInclude>
	/** Reads matching rows with one exact field projection. */
	<const TSelection extends TContract['inputs']['select']>(
		input: GeneratedCursorFindManyInput<TContract, TSelection, undefined>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, TSelection, undefined>
	/** Reads matching rows with one exact eager projection. */
	<const TInclude extends SchemaGeneratedInclude<TContract>>(
		input: GeneratedCursorFindManyInput<TContract, undefined, TInclude>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, undefined, TInclude>
	/** Reads matching rows without narrowing the generated projection. */
	(
		input: GeneratedCursorFindManyInput<TContract, undefined, undefined>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, undefined, undefined>
	/** Reads offset-paginated rows with exact field and eager projections. */
	<
		const TSelection extends TContract['inputs']['select'],
		const TInclude extends SchemaGeneratedInclude<TContract>,
	>(
		// eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate pagination overloads preserve generated aliases in editor hovers.
		input: GeneratedOffsetFindManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, TSelection, TInclude>
	/** Reads offset-paginated rows with one exact field projection. */
	<const TSelection extends TContract['inputs']['select']>(
		// eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate pagination overloads preserve generated aliases in editor hovers.
		input: GeneratedOffsetFindManyInput<TContract, TSelection, undefined>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, TSelection, undefined>
	/** Reads offset-paginated rows with one exact eager projection. */
	<const TInclude extends SchemaGeneratedInclude<TContract>>(
		// eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate pagination overloads preserve generated aliases in editor hovers.
		input: GeneratedOffsetFindManyInput<TContract, undefined, TInclude>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, undefined, TInclude>
	/** Reads offset-paginated rows without narrowing the generated projection. */
	(
		// eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate pagination overloads preserve generated aliases in editor hovers.
		input: GeneratedOffsetFindManyInput<TContract, undefined, undefined>,
		options?: OperationOptions,
	): SchemaFindManyResult<TSchema, undefined, undefined>
	/** Preserves the safe pre-codegen QueryBuilder contract for internal schemas. */
	<const TInput extends FindManyInput<TSchema>>(
		input: BootstrapFindManyInput<TSchema, TInput>,
		options?: OperationOptions,
	): Promise<
		readonly QueryResult<
			TSchema,
			QuerySelectedFieldFromInput<TSchema, TInput>,
			QueryIncludedFieldFromInput<TSchema, TInput>
		>[]
	>
	/** Reads all visible rows through the active request. */
	(
		input?: undefined,
		options?: OperationOptions,
	): Promise<readonly QueryResult<TSchema>[]>
}

/** Executes one generated first-match read with its exact selected result. */
export interface SchemaFindOneMethod<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> {
	/** Reads the first matching row with exact field and eager projections. */
	<
		const TSelection extends TContract['inputs']['select'],
		const TInclude extends SchemaGeneratedInclude<TContract>,
	>(
		input: GeneratedFindOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, TSelection, TInclude> | null>
	/** Reads the first matching row with one exact field projection. */
	<const TSelection extends TContract['inputs']['select']>(
		input: GeneratedFindOneInput<TContract, TSelection, undefined>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, TSelection, undefined> | null>
	/** Reads the first matching row with one exact eager projection. */
	<const TInclude extends SchemaGeneratedInclude<TContract>>(
		input: GeneratedFindOneInput<TContract, undefined, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, undefined, TInclude> | null>
	/** Reads the first matching row without narrowing its projection. */
	(
		input: GeneratedFindOneInput<TContract, undefined, undefined>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, undefined, undefined> | null>
	/** Preserves the safe pre-codegen QueryBuilder contract for internal schemas. */
	<const TInput extends FindOneInput<TSchema>>(
		input: BootstrapFindOneInput<TSchema, TInput>,
		options?: OperationOptions,
	): Promise<QueryResult<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedFieldFromInput<TSchema, TInput>
	> | null>
	/** Reads the first visible row or returns `null`. */
	(
		input?: undefined,
		options?: OperationOptions,
	): Promise<QueryResult<TSchema> | null>
}

/** Executes one generated identifier read with its exact selected result. */
/** Reads one required row by identifier through the exact generated input. */
export interface SchemaGetMethod<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> {
	/** Reads one identifier with exact field and eager projections. */
	<
		const TSelection extends TContract['inputs']['select'],
		const TInclude extends SchemaGeneratedInclude<TContract>,
	>(
		input: GeneratedGetInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, TSelection, TInclude>>
	/** Reads one identifier with one exact field projection. */
	<const TSelection extends TContract['inputs']['select']>(
		input: GeneratedGetInput<TContract, TSelection, undefined>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, TSelection, undefined>>
	/** Reads one identifier with one exact eager projection. */
	<const TInclude extends SchemaGeneratedInclude<TContract>>(
		input: GeneratedGetInput<TContract, undefined, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, undefined, TInclude>>
	/** Reads one identifier without narrowing its projection. */
	(
		input: GeneratedGetInput<TContract, undefined, undefined>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TSchema, undefined, undefined>>
	/** Preserves the safe pre-codegen QueryBuilder contract for internal schemas. */
	<const TInput extends GetInput<TSchema>>(
		input: BootstrapGetInput<TSchema, TInput>,
		options?: OperationOptions,
	): Promise<
		QueryResult<
			TSchema,
			QuerySelectedFieldFromInput<TSchema, TInput>,
			QueryIncludedFieldFromInput<TSchema, TInput>
		>
	>
}

/** Public static schema operations driven by one complete generated contract. */
export interface SchemaAPI<TContract extends SchemaTypeInfo>
	extends SchemaDefinition<TContract['key']>, SchemaTypeInfoCarrier<TContract> {
	/** Counts rows matching the generated schema filter. */
	readonly count: (
		input?: SchemaFilteredInput<TContract>,
		options?: OperationOptions,
	) => Promise<number>
	/** Creates input rows in order through one atomic operation. */
	readonly createMany: SchemaMutationMethod<TContract, 'create-many', this>
	/** Creates one row and returns its generated model projection. */
	readonly createOne: SchemaMutationMethod<TContract, 'create-one', this>
	/** Deletes ordered unique targets through one atomic operation. */
	readonly deleteMany: SchemaMutationMethod<TContract, 'delete-many', this>
	/** Deletes one unique target or returns `null` when none matches. */
	readonly deleteOne: SchemaMutationMethod<TContract, 'delete-one', this>
	/** Tests whether at least one row matches the generated schema filter. */
	readonly exists: (
		input?: SchemaFilteredInput<TContract>,
		options?: OperationOptions,
	) => Promise<boolean>
	/** Reads every matching row through one exact generated input contract. */
	readonly findMany: SchemaFindManyMethod<TContract, this>
	/** Reads the first matching row or returns `null`. */
	readonly findOne: SchemaFindOneMethod<TContract, this>
	/** Reads one required row by identifier. */
	readonly get: SchemaGetMethod<TContract, this>
	/** Updates ordered unique targets through one atomic operation. */
	readonly updateMany: SchemaMutationMethod<TContract, 'update-many', this>
	/** Updates one unique target or returns `null` when none matches. */
	readonly updateOne: SchemaMutationMethod<TContract, 'update-one', this>
	/** Creates or updates ordered unique targets through one atomic operation. */
	readonly upsertMany: SchemaMutationMethod<TContract, 'upsert-many', this>
	/** Creates or updates one unique target. */
	readonly upsertOne: SchemaMutationMethod<TContract, 'upsert-one', this>
}
