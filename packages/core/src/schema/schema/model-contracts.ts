import type { OperationOptions } from '../../query/operations/options.js'
import type { SchemaWhereInput } from '../../query/operations/schema-commands.js'
import type {
	QueryRelationFieldName,
	QueryRelationTargetSchema,
} from '../../query/clauses/inclusion.js'
import type {
	CompactUpdateExpressionInput,
	NumericUpdateInput,
	UpdateExpressionInput,
	UpdateSetInput,
} from '../../query/updates/contracts.js'
import type { Pointer, PointerValue } from '../relations/pointer.js'
import type {
	Relation,
	SchemaRelationFieldName,
} from '../relations/relation.js'
import type {
	SchemaDefinition,
	SchemaExtensions,
	SchemaFields,
	SchemaMetadata,
} from './definition.js'
import type { SchemaCreateData, SchemaItem } from './values.js'

/** Distinguishes caller input, prepared candidates, and persisted values. */
export type SchemaModelState = 'draft' | 'prepared-draft' | 'persisted'

/** Materializes public values and methods while retaining private model identity. */
type Simplify<TValue> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
} & {}

declare const schemaModelStateType: unique symbol
declare const schemaResultCapabilitiesType: unique symbol
declare const schemaModelPointerType: unique symbol

/** @internal Carries nominal lifecycle identity without runtime surface. */
interface SchemaModelStateIdentity<
	TClassName extends string,
	TState extends SchemaModelState,
> {
	readonly [schemaModelStateType]: Readonly<{
		readonly className: TClassName
		readonly state: TState
	}>
}

/** Carries package-owned persisted commands through QueryBuilder result inference. */
export interface SchemaResultCapabilityCarrier<TCapabilities extends object> {
	readonly [schemaResultCapabilitiesType]: TCapabilities
}

/** Retains exact pointer inference behind a type-only nominal model boundary. */
interface SchemaModelPointerCarrier {
	readonly [schemaModelPointerType]: PointerValue
}

interface SchemaModelPointerIdentity<
	TPointer extends PointerValue,
> extends SchemaModelPointerCarrier {
	readonly [schemaModelPointerType]: TPointer
}

type SchemaModelPointerFor<TSource extends SchemaModelPointerCarrier> =
	NonNullable<TSource[typeof schemaModelPointerType]>

/** Extracts specialized persisted commands without affecting ordinary schemas. */
export type SchemaResultCapabilitiesOf<TSchema> =
	TSchema extends SchemaResultCapabilityCarrier<infer TCapabilities>
		? TCapabilities
		: Readonly<Record<never, never>>

/** Identifies a trusted persisted model independently from its visible selection. */
export type PersistedSchemaReference<TSchema extends SchemaDefinition> =
	SchemaModelStateIdentity<TSchema['className'], 'persisted'>

/** Exposes immutable values without leaking the model's private lifecycle state. */
interface SchemaModelMethods<TValues extends object> {
	/** Reads one visible value through its exact field name. */
	get<const TField extends Extract<keyof TValues, string>>(
		field: TField,
	): TValues[TField]
	/** Returns a detached immutable object containing only visible values. */
	toJSON(): TValues
}

/** Describes one flat instance result projection without retaining field definitions. */
export type SchemaModelSelection<TValues extends object> = Readonly<
	Partial<Record<Exclude<Extract<keyof TValues, string>, 'id'>, boolean>> &
		('id' extends keyof TValues ? { readonly id?: true } : object)
>

type SchemaModelSelectionKeyWithValue<TSelection, TValue extends boolean> = {
	[TKey in keyof TSelection]-?: [TSelection[TKey]] extends [TValue]
		? TKey
		: never
}[keyof TSelection]

type SchemaModelSelectedField<
	TValues extends object,
	TSelection,
> = keyof TSelection extends never
	? never
	: | ([SchemaModelSelectionKeyWithValue<TSelection, true>] extends [never]
				? Exclude<
						Extract<keyof TValues, string>,
						SchemaModelSelectionKeyWithValue<TSelection, false>
					>
				: Extract<
						SchemaModelSelectionKeyWithValue<TSelection, true>,
						keyof TValues
					>)
		| Extract<'id', keyof TValues>

type LiteralSchemaModelSelection<TSelection> = {
	readonly [TKey in keyof TSelection]: boolean extends TSelection[TKey]
		? never
		: TSelection[TKey]
}

type ExactSchemaModelSelection<
	TValues extends object,
	TSelection,
> = TSelection &
	Readonly<Record<Exclude<keyof TSelection, keyof TValues>, never>>

type SchemaModelResultSelection<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined,
> = [TSelection] extends [SchemaModelSelection<TValues>]
	? Readonly<{
			readonly select: SchemaModelSelection<TValues> &
				ExactSchemaModelSelection<TValues, TSelection> &
				LiteralSchemaModelSelection<TSelection>
		}>
	: Readonly<{ readonly select?: never }>

export interface SchemaDraftUpsertFields<TSchema extends SchemaDefinition> {
	/** Builds the exact equality target that Runtime verifies against a unique index. */
	readonly where: SchemaWhereInput<TSchema>
	/** Applies this exact atomic update when the unique target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Combines a draft's create values with one unique target, update, and projection. */
export type SchemaDraftUpsertInput<
	TSchema extends SchemaDefinition,
	TSelection extends SchemaModelSelection<SchemaItem<TSchema>> | undefined =
		undefined,
> = SchemaDraftUpsertFields<TSchema> &
	SchemaModelResultSelection<SchemaItem<TSchema>, TSelection>

/** Names one exact field-oriented update without retaining field definitions in hovers. */
export type CompactSchemaModelUpdateInput<
	TSet extends object,
	TNumeric extends object,
> = CompactUpdateExpressionInput<TSet, TNumeric>

/** Infers the compact atomic update surface reused by persisted model commands. */
export type SchemaModelUpdateInput<TSchema extends SchemaDefinition> =
	CompactSchemaModelUpdateInput<
		Simplify<UpdateSetInput<TSchema>>,
		Simplify<NumericUpdateInput<TSchema>>
	>

/** Selects the visible result returned after one draft is persisted. */
export type SchemaModelCreateInput<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelResultSelection<TValues, TSelection>

/** Selects the visible fields returned when one persisted model is refreshed. */
export type SchemaModelFetchInput<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelResultSelection<TValues, TSelection>

interface SchemaModelUpdateFields<TUpdateInput extends object> {
	/** Applies typed atomic field operations to the protected object identity. */
	readonly data: TUpdateInput
}

/** Combines one instance update expression with its exact result projection. */
export type SchemaModelUpdateCommandInput<
	TValues extends object,
	TUpdateInput extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelUpdateFields<TUpdateInput> &
	SchemaModelResultSelection<TValues, TSelection>

/** Selects the visible pre-delete result of one protected object identity. */
export type SchemaModelDeleteInput<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelResultSelection<TValues, TSelection>

/** Computes the visible model values produced by one literal instance selection. */
type SchemaModelSelectedValues<TValues extends object, TSelection> = [
	SchemaModelSelectedField<TValues, TSelection>,
] extends [never]
	? TValues
	: Simplify<
			Pick<
				TValues,
				Extract<SchemaModelSelectedField<TValues, TSelection>, keyof TValues>
			>
		>

/** Retains exact pointer identity without expanding schema fields in command hovers. */
type PersistedSchemaModelWithPointer<
	TSource extends SchemaModelPointerCarrier,
	TClassName extends string,
	TValues extends object,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
> = Simplify<
	PersistedSchemaModel<
		TClassName,
		TValues,
		TUpdateInput,
		TRelations,
		TCompleteValues,
		SchemaModelPointerFor<TSource>
	>
>

/** Materializes a selected model exactly like QueryBuilder result inference. */
type SelectedPersistedSchemaModel<
	TSource extends SchemaModelPointerCarrier,
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
	TSelection,
> = PersistedSchemaModelWithPointer<
	TSource,
	TClassName,
	SchemaModelSelectedValues<TCompleteValues, TSelection>,
	TCompleteValues,
	TUpdateInput,
	TRelations
>

/** Exposes only persistence commands valid for a caller-created immutable draft. */
export interface SchemaDraftCommands<
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
	TUpsertFields extends object,
	TPointer extends PointerValue,
> extends SchemaModelPointerIdentity<TPointer> {
	/**
	 * Persists this draft and returns its selected model fields.
	 *
	 * @example `await draft.create({ select: { id: true, title: true } })`
	 */
	create<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelCreateInput<TCompleteValues, TSelection>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/**
	 * Persists this draft and returns its complete model.
	 *
	 * @example `const created = await new Post({ title: "Hello" }).create({})`
	 */
	create(
		input: SchemaModelCreateInput<TCompleteValues>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			undefined
		>
	>
	/**
	 * Creates this draft or updates one target and returns selected model fields.
	 *
	 * @example `await draft.upsert({ where: { slug: { eq: "hello" } }, update: { views: increment(1) }, select: { id: true } })`
	 */
	upsert<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: TUpsertFields &
			SchemaModelResultSelection<TCompleteValues, TSelection>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/** Creates this draft or updates one unique target and returns the complete model. */
	upsert(
		input: TUpsertFields &
			SchemaModelResultSelection<TCompleteValues, undefined>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			undefined
		>
	>
}

/** Exposes only object-targeted commands valid for trusted persisted instances. */
export interface SchemaResultCommands<
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
	TPointer extends PointerValue,
> extends SchemaModelPointerIdentity<TPointer> {
	/**
	 * Reloads this protected object identity and returns selected fresh fields.
	 *
	 * @example `const fresh = await post.fetch({ select: { id: true, title: true } })`
	 * @throws `FrameworkError` with code `NOT_FOUND` when the object is missing or inaccessible.
	 */
	fetch<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelFetchInput<TCompleteValues, TSelection>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/** Reloads this protected object identity and returns its complete model. */
	fetch(
		input: SchemaModelFetchInput<TCompleteValues>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			undefined
		>
	>
	/**
	 * Tests whether this protected object identity is still readable.
	 *
	 * @example `if (await post.exists()) { /* the object remains readable *\/ }`
	 */
	exists(options?: OperationOptions): Promise<boolean>
	/**
	 * Returns this model's exact immutable pointer without performing database I/O.
	 *
	 * @example `const author = user.toPointer()`
	 */
	toPointer(): TPointer
	/**
	 * Compares schema and protected identity without performing database I/O.
	 *
	 * @example `if (post.equals(pointer)) { /* both identify the same object *\/ }`
	 */
	equals(
		other: PointerValue | PersistedSchemaReference<SchemaDefinition>,
	): boolean
	/**
	 * Updates this protected object identity and returns selected model fields.
	 *
	 * @example `const updated = await post.update({ data: { title: "Updated" }, select: { id: true } })`
	 * @throws `FrameworkError` with code `NOT_FOUND` when the object is missing or inaccessible.
	 */
	update<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelUpdateCommandInput<
			TCompleteValues,
			TUpdateInput,
			TSelection
		>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/**
	 * Updates this protected object identity and returns the complete model.
	 *
	 * @example `const updated = await post.update({ data: { title: "Updated" } })`
	 */
	update(
		input: SchemaModelUpdateCommandInput<TCompleteValues, TUpdateInput>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			undefined
		>
	>
	/**
	 * Deletes this protected object identity and returns selected pre-delete fields.
	 *
	 * @example `const deleted = await post.delete({ select: { id: true } })`
	 * @throws `FrameworkError` with code `NOT_FOUND` when the object is missing or inaccessible.
	 */
	delete<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelDeleteInput<TCompleteValues, TSelection>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/**
	 * Deletes this protected object identity and returns the complete model.
	 *
	 * @example `const deleted = await post.delete({})`
	 */
	delete(
		input: SchemaModelDeleteInput<TCompleteValues>,
		options?: OperationOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			Pick<this, typeof schemaModelPointerType>,
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			undefined
		>
	>
}

/** Exposes exact to-many handles only on Runtime-materialized model results. */
interface SchemaResultRelationCommands<TSchema extends SchemaDefinition> {
	/**
	 * Returns an independently queryable immutable relationship handle.
	 *
	 * Only declared relation fields are suggested. The handle uses Runtime's
	 * protected identity as a defensive correlation check instead of trusting a
	 * caller-visible value as mutation authority.
	 *
	 * @example `const tags = post.relation('tags')`
	 */
	relation<const TFieldName extends QueryRelationFieldName<TSchema>>(
		fieldName: TFieldName,
	): Relation<TSchema, QueryRelationTargetSchema<TSchema, TFieldName>>
}

/** Omits the relation method entirely when a schema declares no to-many fields. */
export type SchemaResultRelations<TSchema extends SchemaDefinition> = [
	SchemaRelationFieldName<TSchema>,
] extends [never]
	? Readonly<Record<never, never>>
	: SchemaResultRelationCommands<TSchema>

/** Keeps persisted model hovers independent from complete field definitions. */
export type PersistedSchemaModel<
	TClassName extends string,
	TValues extends object,
	TUpdateInput extends object,
	TRelations extends object = Readonly<Record<never, never>>,
	TCompleteValues extends object = TValues,
	TPointer extends PointerValue = Pointer<SchemaDefinition<TClassName>>,
> = SchemaModelInstance<SchemaDefinition<TClassName>, 'persisted', TValues> &
	SchemaResultCommands<
		TClassName,
		TCompleteValues,
		TUpdateInput,
		TRelations,
		TPointer
	> &
	TRelations

/** Represents one immutable instance of an exact generated schema class. */
type SchemaModelInstance<
	TSchema extends SchemaDefinition,
	TState extends SchemaModelState,
	TValues extends object,
> = Simplify<Readonly<TValues>> &
	SchemaModelMethods<Readonly<TValues>> &
	SchemaModelStateIdentity<TSchema['className'], TState>

/** Infers the immutable draft produced by a schema class constructor. */
export type SchemaDraft<TSchema extends SchemaDefinition> = Simplify<
	SchemaModelInstance<TSchema, 'draft', SchemaCreateData<TSchema>> &
		SchemaDraftCommands<
			TSchema['className'],
			SchemaItem<TSchema>,
			CompactSchemaModelUpdateInput<
				Simplify<UpdateSetInput<TSchema>>,
				Simplify<NumericUpdateInput<TSchema>>
			>,
			SchemaResultRelations<TSchema> & SchemaResultCapabilitiesOf<TSchema>,
			SchemaDraftUpsertFields<TSchema>,
			Pointer<TSchema>
		>
>

/** Exposes one complete normalized candidate without persistence commands. */
export type SchemaPreparedDraft<TSchema extends SchemaDefinition> = Simplify<
	SchemaModelInstance<TSchema, 'prepared-draft', SchemaItem<TSchema>>
>

/** Infers one persisted schema-class instance with an exact visible shape. */
export type SchemaResult<
	TSchema extends SchemaDefinition,
	TValues extends object = SchemaItem<TSchema>,
> = PersistedSchemaModelWithPointer<
	SchemaModelPointerIdentity<Pointer<TSchema>>,
	TSchema['className'],
	TValues,
	SchemaItem<TSchema>,
	CompactSchemaModelUpdateInput<
		Simplify<UpdateSetInput<TSchema>>,
		Simplify<NumericUpdateInput<TSchema>>
	>,
	SchemaResultRelations<TSchema> & SchemaResultCapabilitiesOf<TSchema>
>

/** Gives one specialization only the safe model operations needed by commands. */
export interface SchemaModelCapabilityContext<
	TSchema extends SchemaDefinition,
> {
	readonly schema: TSchema
	/** Rejects drafts and forged receivers before a specialized command runs. */
	assertPersisted(instance: object, command: string): void
	/** Converts an exact Pointer or persisted model into a detached Pointer. */
	toPointer<TTarget extends SchemaDefinition>(
		target: TTarget,
		value: Pointer<TTarget> | PersistedSchemaReference<TTarget>,
		command: string,
	): Pointer<TTarget>
}

/** Carries Runtime-only identity and projection data into one public model shell. */
export interface SchemaModelMaterialization {
	readonly objectId?: unknown
	readonly selectedFields?: readonly string[] | undefined
}

/** Resolves metadata only after an application's static schema compilation. */
export interface SchemaModelDefinitionReader<
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> {
	readonly className: TClassName
	readonly readDefinition: () => SchemaMetadata<
		TClassName,
		TFields,
		TExtensions
	>
	readonly readDeveloperFields: () => TFields
}
