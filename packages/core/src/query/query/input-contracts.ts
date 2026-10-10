import type {
	SchemaTypeInfo,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
import type { QueryFieldName } from '../ast/contracts.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelectedField,
	QuerySelection,
} from '../clauses/selection.js'
import type {
	QueryIncludableFieldName,
	QueryPointerFieldName,
	QueryPointerTargetSchema,
	QueryRelationFieldName,
	QueryRelationTargetSchema,
} from '../clauses/inclusion.js'
import type { WhereInput } from '../filters/where.js'
import type { OperationObjectId } from '../operations/contracts.js'
import type {
	QueryPointerResultInclusion,
	QueryRelationResultInclusion,
} from './result.js'

/** Uses concise transport-facing directions independently from AST vocabulary. */
export type QueryOrderByDirection = 'asc' | 'desc'

/** Uses the compact resolved ordering contract when available. */
export type QueryOrderByInput<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'OrderBy'>

/** Shapes one included pointer target without adding another execution boundary. */
export type QueryPointerTargetInput<TSchema extends SchemaTypeInfoSource> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		readonly select?: QuerySelection<TSchema>
	}>

/** Shapes one included to-many target without adding another execution boundary. */
export type QueryRelationTargetInput<TSchema extends SchemaTypeInfoSource> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		/** Skips the same number of rows independently in every parent collection. */
		readonly skip?: number
		readonly take?: number
		readonly orderBy?: QueryOrderByInput<TSchema>
		readonly select?: QuerySelection<TSchema>
		readonly where?: WhereInput<TSchema>
	}>

/** Uses the resolved relationship input without reconstructing schema fields. */
export type QueryIncludeInput<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Include'>

interface QueryProjectionInput<TSchema extends SchemaTypeInfoSource> {
	/** Loads explicitly requested relationship targets through independently shaped reads. */
	readonly include?: QueryIncludeInput<TSchema>
	/** Projects result fields through literal inclusion or exclusion flags. */
	readonly select?: QuerySelection<TSchema>
}

declare const queryBuilderInputType: unique symbol

interface QueryBuilderInputIdentity<TSelectedField, TIncludedField> {
	readonly [queryBuilderInputType]: Readonly<{
		readonly includedField: TIncludedField
		readonly selectedField: TSelectedField
	}>
}

interface QueryFilteredInput<TSchema extends SchemaTypeInfoSource> {
	/** Restricts the visible row universe through the canonical object filter. */
	readonly where?: WhereInput<TSchema>
}

/**
 * Names the last row received from a `findMany` of the same shape. Core reads
 * `id` and every ordered field from it; other properties are ignored.
 */
export type QueryPosition = Readonly<{
	readonly id: string
	readonly [field: string]: unknown
}>

interface FindManyBaseInput<TSchema extends SchemaTypeInfoSource>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/**
	 * Returns the rows strictly after this previously received row, in the
	 * `orderBy` order completed by `id`. Cannot be combined with `skip`.
	 *
	 * @example `await Todo.findMany({ orderBy: { title: 'asc' }, take: 20, after: page.at(-1) })`
	 */
	readonly after?: QueryPosition
	/** Skips this many rows. Cannot be combined with `after`. */
	readonly skip?: number
	/** Returns at most this many rows. */
	readonly take?: number
	/** Applies deterministic priority ordering from left to right, completed by `id`. */
	readonly orderBy?: QueryOrderByInput<TSchema>
}

/** Describes one complete collection read without retaining execution state. */
export type FindManyInput<TSchema extends SchemaTypeInfoSource> =
	FindManyBaseInput<TSchema>

/** Describes one first-match read with optional deterministic ordering. */
export interface FindOneInput<TSchema extends SchemaTypeInfoSource>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: QueryOrderByInput<TSchema>
}

/** Describes one exact identifier read and its result projection. */
export interface GetInput<
	TSchema extends SchemaTypeInfoSource,
> extends QueryProjectionInput<TSchema> {
	/** Selects the framework-owned object identity. */
	readonly id: OperationObjectId<TSchema>
}

/** Describes one filtered count without irrelevant projection clauses. */
export type CountInput<TSchema extends SchemaTypeInfoSource> =
	QueryFilteredInput<TSchema>

/** Describes one filtered existence check without loading model values. */
export type ExistsInput<TSchema extends SchemaTypeInfoSource> =
	QueryFilteredInput<TSchema>

type ExactSelectionForInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly select: infer TSelection }
	? Readonly<{
			readonly select: TSelection &
				QuerySelection<TSchema> &
				ExactQuerySelection<TSchema, TSelection> &
				LiteralQuerySelection<TSelection>
		}>
	: unknown

type ExactInclusionTargetInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
	TContract,
> = TInput extends TContract
	? TInput &
			Readonly<Record<Exclude<keyof TInput, keyof TContract>, never>> &
			ExactSelectionForInput<TSchema, TInput> &
			ExactIncludeForInput<TSchema, TInput>
	: never

type ExactIncludeValue<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TInclude,
> = TFieldName extends keyof TInclude
	? TFieldName extends QueryPointerFieldName<TSchema>
		? ExactInclusionTargetInput<
				QueryPointerTargetSchema<TSchema, TFieldName>,
				TInclude[TFieldName],
				QueryPointerTargetInput<QueryPointerTargetSchema<TSchema, TFieldName>>
			>
		: TFieldName extends QueryRelationFieldName<TSchema>
			? ExactInclusionTargetInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TInclude[TFieldName],
					QueryRelationTargetInput<
						QueryRelationTargetSchema<TSchema, TFieldName>
					>
				>
			: never
	: never

type ExactQueryInclude<
	TSchema extends SchemaTypeInfoSource,
	TInclude,
> = TInclude &
	Readonly<
		Record<Exclude<keyof TInclude, QueryIncludableFieldName<TSchema>>, never>
	> &
	Readonly<{
		readonly [
			TFieldName in Extract<keyof TInclude, QueryIncludableFieldName<TSchema>>
		]: ExactIncludeValue<TSchema, TFieldName, TInclude>
	}>

type ExactIncludeForInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Readonly<{
			readonly include: ExactQueryInclude<TSchema, TInclude>
		}>
	: unknown

/**
 * Rejects unknown clauses and imprecise nested projections on one read input.
 * `NoInfer` keeps resolved clause aliases visible while `TInput` still retains
 * the literal projection needed to infer the exact result model.
 */
export type ExactReadInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
	TContract,
> =
	string extends QueryFieldName<TSchema>
		? NoInfer<TContract> & TInput
		: NoInfer<TContract> &
				TInput &
				Readonly<
					Record<
						Exclude<
							keyof TInput,
							| (TContract extends unknown ? keyof TContract : never)
							| typeof queryBuilderInputType
						>,
						never
					>
				> &
				ExactSelectionForInput<TSchema, TInput> &
				ExactIncludeForInput<TSchema, TInput>

type ExactReadSelectionInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
> = string extends TContract['fields']
	? Readonly<{
			readonly select?: TSelection & TContract['inputs']['select']
		}>
	: Readonly<{
			readonly select?: TSelection &
				TContract['inputs']['select'] &
				Readonly<
					Record<
						Exclude<keyof TSelection, keyof TContract['inputs']['select']>,
						never
					>
				> &
				LiteralQuerySelection<TSelection>
		}>

type ExactGeneratedValue<TInput, TContract> = TInput extends readonly unknown[]
	? TInput extends TContract
		? TInput
		: never
	: TInput extends object
		? TContract extends object
			? TInput &
					Readonly<Record<Exclude<keyof TInput, keyof TContract>, never>> &
					Readonly<{
						readonly [TKey in keyof TInput]: TKey extends keyof TContract
							? ExactGeneratedValue<TInput[TKey], NonNullable<TContract[TKey]>>
							: never
					}>
			: never
		: TInput extends TContract
			? TInput
			: never

type ExactReadInclusionInput<
	TContract extends SchemaTypeInfo,
	TInclude,
> = string extends TContract['fields']
	? Readonly<{
			readonly include?: TInclude & NonNullable<TContract['inputs']['include']>
		}>
	: Readonly<{
			readonly include?: NonNullable<TContract['inputs']['include']> &
				TInclude &
				ExactGeneratedValue<
					TInclude,
					NonNullable<TContract['inputs']['include']>
				>
		}>

/** Reuses exact resolved nested inclusion validation outside read terminals. */
export type ExactGeneratedInclusionInput<
	TSchema extends SchemaTypeInfoSource,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = ExactReadInclusionInput<SchemaTypeInfoFor<TSchema>, TInclude>

interface ExactFindManyFields<TContract extends SchemaTypeInfo> {
	/**
	 * Returns the rows strictly after this previously received row, in the
	 * `orderBy` order completed by `id`. Cannot be combined with `skip`.
	 *
	 * @example `await Todo.findMany({ orderBy: { title: 'asc' }, take: 20, after: page.at(-1) })`
	 */
	readonly after?: QueryPosition
	/** Returns at most this many rows. */
	readonly take?: number
	/** Applies deterministic priority ordering from left to right, completed by `id`. */
	readonly orderBy?: TContract['inputs']['orderBy']
	/** Restricts the visible row universe through the resolved schema filter. */
	readonly where?: TContract['inputs']['where']
}

type ExactFindManyProjectionInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends TContract['inputs']['include'] | undefined,
> = ExactFindManyFields<TContract> &
	ExactReadSelectionInput<TContract, TSelection> &
	ExactReadInclusionInput<TContract, TInclude>

interface ExactFindOneFields<TContract extends SchemaTypeInfo> {
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: TContract['inputs']['orderBy']
	/** Restricts the visible row universe through the resolved schema filter. */
	readonly where?: TContract['inputs']['where']
}

/** Describes one exact first-match read from its resolved contract. */
export type ExactGeneratedFindOneInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined = undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
> = ExactFindOneFields<TContract> &
	ExactReadSelectionInput<TContract, TSelection> &
	ExactReadInclusionInput<TContract, TInclude>

/** Describes one exact collection read using optional `skip` or `after` pagination. */
export type ExactGeneratedFindManyInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined = undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
> = ExactFindManyProjectionInput<TContract, TSelection, TInclude> &
	Readonly<{
		/** Skips this many rows. Cannot be combined with `after`. */
		readonly skip?: number
	}>

type SelectedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly select: infer TSelection }
	? QuerySelectedField<TSchema, TSelection>
	: never

type IncludedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Extract<keyof TInclude, QueryPointerFieldName<TSchema>>
	: never

/** Resolves the exact visible field union produced by one canonical read input. */
export type QuerySelectedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<infer TSelectedField, unknown>
		? Extract<TSelectedField, QueryFieldName<TSchema>>
		: [SelectedFieldFromInput<TSchema, TInput>] extends [never]
			? never
			: | SelectedFieldFromInput<TSchema, TInput>
				| IncludedFieldFromInput<TSchema, TInput>

type PointerInclusionForField<
	TSchema extends SchemaTypeInfoSource,
	TInclude,
	TFieldName extends QueryPointerFieldName<TSchema>,
> = TFieldName extends keyof TInclude
	? TInclude[TFieldName] extends infer TTargetInput
		? QueryPointerResultInclusion<
				TFieldName,
				QueryPointerTargetSchema<TSchema, TFieldName>,
				QuerySelectedFieldFromInput<
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>,
				QueryIncludedFieldFromInput<
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>
			>
		: never
	: never

type RelationInclusionForField<
	TSchema extends SchemaTypeInfoSource,
	TInclude,
	TFieldName extends QueryRelationFieldName<TSchema>,
> = TFieldName extends keyof TInclude
	? TInclude[TFieldName] extends infer TTargetInput
		? QueryRelationResultInclusion<
				TFieldName,
				QueryRelationTargetSchema<TSchema, TFieldName>,
				QuerySelectedFieldFromInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>,
				QueryIncludedFieldFromInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>
			>
		: never
	: never

/** Resolves every exact nested eager result produced by one read input. */
export type QueryIncludedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<unknown, infer TIncludedField>
		? TIncludedField
		: TInput extends { readonly include: infer TInclude }
			? | {
						[
							TFieldName in Extract<
								keyof TInclude,
								QueryPointerFieldName<TSchema>
							>
						]: PointerInclusionForField<TSchema, TInclude, TFieldName>
				  }[Extract<keyof TInclude, QueryPointerFieldName<TSchema>>]
				| {
						[
							TFieldName in Extract<
								keyof TInclude,
								QueryRelationFieldName<TSchema>
							>
						]: RelationInclusionForField<TSchema, TInclude, TFieldName>
				  }[Extract<keyof TInclude, QueryRelationFieldName<TSchema>>]
			: never

/** Retains exact builder result inference without adding runtime metadata. */
export type QueryBuilderInput<
	TSchema extends SchemaTypeInfoSource,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedField,
> = FindManyInput<TSchema> &
	QueryBuilderInputIdentity<TSelectedField, TIncludedField>
