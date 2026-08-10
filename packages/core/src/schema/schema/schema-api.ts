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
	CountInput,
	ExactReadInput,
	ExistsInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import type { QueryResult } from '../../query/query/result.js'
import type { SchemaTypeInfo, SchemaTypeInfoCarrier } from '../type-info.js'
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
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
> = TKind extends 'create-one'
	? SchemaCreateOneInput<TSchema, TSelection>
	: TKind extends 'create-many'
		? SchemaCreateManyInput<TSchema, TSelection>
		: TKind extends 'update-one'
			? SchemaUpdateOneInput<TSchema, TSelection>
			: TKind extends 'update-many'
				? SchemaUpdateManyInput<TSchema, TSelection>
				: TKind extends 'upsert-one'
					? SchemaUpsertOneInput<TSchema, TSelection>
					: TKind extends 'upsert-many'
						? SchemaUpsertManyInput<TSchema, TSelection>
						: TKind extends 'delete-one'
							? SchemaDeleteOneInput<TSchema, TSelection>
							: SchemaDeleteManyInput<TSchema, TSelection>

type SchemaMutationSelectedField<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
	TSelection,
> = [TSelection] extends [QuerySelection<TSchema>]
	? QuerySelectedField<TSchema, TSelection>
	: TKind extends 'delete-many' | 'update-many'
		? Extract<'id', QueryFieldName<TSchema>>
		: never

type SchemaMutationResult<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
	TSelection,
> = TKind extends 'create-many' | 'delete-many' | 'update-many' | 'upsert-many'
	? readonly QueryResult<
			TSchema,
			SchemaMutationSelectedField<TSchema, TKind, TSelection>
		>[]
	: TKind extends 'delete-one' | 'update-one'
		? QueryResult<
				TSchema,
				SchemaMutationSelectedField<TSchema, TKind, TSelection>
			> | null
		: QueryResult<
				TSchema,
				SchemaMutationSelectedField<TSchema, TKind, TSelection>
			>

/** Executes one generated mutation kind without reconstructing schema fields. */
export interface SchemaMutationMethod<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
> {
	/** Executes this mutation and returns the requested generated projection. */
	<const TSelection extends QuerySelection<TSchema>>(
		input: SchemaMutationInput<TSchema, TKind, TSelection>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TSchema, TKind, TSelection>>
	/** Executes this mutation with its generated default projection. */
	(
		input: SchemaMutationInput<TSchema, TKind>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TSchema, TKind, undefined>>
}

/** Executes one generated collection read with its exact selected result. */
export interface SchemaFindManyMethod<TSchema extends SchemaDefinition> {
	/** Reads matching rows through the active request and exact generated input. */
	<const TInput extends FindManyInput<TSchema>>(
		input: ExactReadInput<TSchema, TInput, FindManyInput<TSchema>>,
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
export interface SchemaFindOneMethod<TSchema extends SchemaDefinition> {
	/** Reads the first matching row through the exact generated input. */
	<const TInput extends FindOneInput<TSchema>>(
		input: ExactReadInput<TSchema, TInput, FindOneInput<TSchema>>,
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
export type SchemaGetMethod<TSchema extends SchemaDefinition> = <
	const TInput extends GetInput<TSchema>,
>(
	input: ExactReadInput<TSchema, TInput, GetInput<TSchema>>,
	options?: OperationOptions,
) => Promise<
	QueryResult<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedFieldFromInput<TSchema, TInput>
	>
>

/** Public static schema operations driven by one complete generated contract. */
export interface SchemaAPI<TContract extends SchemaTypeInfo>
	extends SchemaDefinition<TContract['key']>, SchemaTypeInfoCarrier<TContract> {
	/** Counts rows matching the generated schema filter. */
	readonly count: (
		input?: CountInput<this>,
		options?: OperationOptions,
	) => Promise<number>
	/** Creates input rows in order through one atomic operation. */
	readonly createMany: SchemaMutationMethod<this, 'create-many'>
	/** Creates one row and returns its generated model projection. */
	readonly createOne: SchemaMutationMethod<this, 'create-one'>
	/** Deletes ordered unique targets through one atomic operation. */
	readonly deleteMany: SchemaMutationMethod<this, 'delete-many'>
	/** Deletes one unique target or returns `null` when none matches. */
	readonly deleteOne: SchemaMutationMethod<this, 'delete-one'>
	/** Tests whether at least one row matches the generated schema filter. */
	readonly exists: (
		input?: ExistsInput<this>,
		options?: OperationOptions,
	) => Promise<boolean>
	/** Reads every matching row through one exact generated input contract. */
	readonly findMany: SchemaFindManyMethod<this>
	/** Reads the first matching row or returns `null`. */
	readonly findOne: SchemaFindOneMethod<this>
	/** Reads one required row by identifier. */
	readonly get: SchemaGetMethod<this>
	/** Updates ordered unique targets through one atomic operation. */
	readonly updateMany: SchemaMutationMethod<this, 'update-many'>
	/** Updates one unique target or returns `null` when none matches. */
	readonly updateOne: SchemaMutationMethod<this, 'update-one'>
	/** Creates or updates ordered unique targets through one atomic operation. */
	readonly upsertMany: SchemaMutationMethod<this, 'upsert-many'>
	/** Creates or updates one unique target. */
	readonly upsertOne: SchemaMutationMethod<this, 'upsert-one'>
}
