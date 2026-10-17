import type { QueryFieldName } from '../../query/ast/contracts.js'
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

/**
 * Resolves one mutation result like a read with the same projection, except
 * that without `select` a write returns `id` plus the included fields
 * (ADR-0341).
 */
type SchemaMutationResult<
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
	TSelection,
	TInclude = undefined,
> = QueryResult<
	TSchema,
	Extract<
		[TSelection] extends [undefined]
			? 'id' | Extract<keyof NonNullable<TInclude>, QueryFieldName<TContract>>
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

/** Public static schema operations driven directly by one resolved contract. */
export interface SchemaAPI<TContract extends SchemaTypeInfo>
	extends SchemaDefinition<TContract['key']>, SchemaTypeInfoCarrier<TContract> {
	/** Counts rows matching the resolved schema filter. */
	count(
		input?: SchemaFilteredInput<TContract>,
		options?: OperationOptions,
	): Promise<number>

	/** Creates ordered rows and returns `{ id }` for each unless `select` or `include` asks for more. */
	createMany<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input: SchemaCreateManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaMutationResult<TContract, this, TSelection, TInclude>[]
	>

	/**
	 * Creates one row and returns `{ id }` unless `select` or `include` asks
	 * for more; a selection beyond `id` requires the caller to read the row.
	 *
	 * @example `const { id } = await Todo.createOne({ data: { title: 'Ship' } })`
	 */
	createOne<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input: SchemaCreateOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection, TInclude>>

	/** Deletes ordered unique targets and returns `{ id }` for each unless `select` asks for more. */
	deleteMany<const TSelection extends object | undefined = undefined>(
		input: SchemaDeleteManyInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<readonly SchemaMutationResult<TContract, this, TSelection>[]>

	/** Deletes one unique target and returns `{ id }` unless `select` asks for more, or `null` when none matches. */
	deleteOne<const TSelection extends object | undefined = undefined>(
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
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input?: ExactGeneratedFindManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<readonly SchemaReadResult<TContract, this, TSelection, TInclude>[]>

	/** Reads the first matching row or returns `null`. */
	findOne<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input?: ExactGeneratedFindOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TContract, this, TSelection, TInclude> | null>

	/**
	 * Reads the first matching row or fails with `NOT_FOUND`, also when the row
	 * exists but is hidden from the caller.
	 *
	 * @example `await Todo.findOneOrThrow({ where: { id } })`
	 */
	findOneOrThrow<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input?: ExactGeneratedFindOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaReadResult<TContract, this, TSelection, TInclude>>

	/** Updates ordered unique targets and returns `{ id }` for each unless `select` or `include` asks for more. */
	updateMany<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input: SchemaUpdateManyInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<
		readonly SchemaMutationResult<TContract, this, TSelection, TInclude>[]
	>

	/** Updates one unique target and returns `{ id }` unless `select` or `include` asks for more, or `null` when none matches. */
	updateOne<
		const TSelection extends object | undefined = undefined,
		const TInclude extends object | undefined = undefined,
	>(
		input: SchemaUpdateOneInput<TContract, TSelection, TInclude>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection, TInclude> | null>

	/** Creates or updates ordered unique targets and returns `{ id }` for each unless `select` asks for more. */
	upsertMany<const TSelection extends object | undefined = undefined>(
		input: SchemaUpsertManyInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<readonly SchemaMutationResult<TContract, this, TSelection>[]>

	/** Creates or updates one unique target and returns `{ id }` unless `select` asks for more. */
	upsertOne<const TSelection extends object | undefined = undefined>(
		input: SchemaUpsertOneInput<TContract, TSelection>,
		options?: OperationOptions,
	): Promise<SchemaMutationResult<TContract, this, TSelection>>
}
