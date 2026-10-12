import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import type { FieldValueMap } from '../schema/fields/base/value-map.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'

declare const privateCollectionBrand: unique symbol
declare const privateCollectionFields: unique symbol
declare const privateCollectionIndexes: unique symbol

/** Describes one exact unique lookup supported by a private collection. */
export interface PrivateCollectionUniqueIndex<
	TFields extends Readonly<Record<string, GenericField>>,
	TNames extends readonly (keyof TFields & string)[] = readonly (keyof TFields &
		string)[],
> {
	readonly fields: TNames
}

/** Links one private UUID field to one exact public application schema. */
export interface PrivateCollectionReference<
	TFields extends Readonly<Record<string, GenericField>>,
	TField extends keyof TFields & string = keyof TFields & string,
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly field: TField
	readonly onDelete: 'cascade' | 'fail'
	readonly target: TSchema
}

/** Configures one callback-free owner-private collection declaration. */
export interface DefinePrivateCollectionOptions<
	TFields extends Readonly<Record<string, GenericField>>,
	TIndexes extends readonly PrivateCollectionUniqueIndex<TFields>[],
> {
	/** Stable owner-local identity retained by adapter and migration provenance. */
	readonly contributionId: string
	/** Declares portable field definitions; generated values and defaults are intentionally unsupported. */
	readonly fields: TFields
	/** Declares every exact lookup and uniqueness constraint available to the owner. */
	readonly indexes: TIndexes
	/** Retains deterministic inert options in fingerprints and upgrade metadata. */
	readonly normalizedStaticOptions?: Readonly<Record<string, JsonValue>>
	/** Advances only when the private collection protocol changes incompatibly. */
	readonly protocolVersion?: number
	/** Adds portable referential integrity toward exact public application schemas. */
	readonly references?: readonly PrivateCollectionReference<TFields>[]
}

/** Nominally identifies one private collection without exposing its descriptor. */
export interface PrivateCollection<
	TFields extends Readonly<Record<string, GenericField>> = Readonly<
		Record<string, GenericField>
	>,
	TIndexes extends readonly PrivateCollectionUniqueIndex<TFields>[] =
		readonly PrivateCollectionUniqueIndex<TFields>[],
> {
	readonly [privateCollectionBrand]: true
	readonly [privateCollectionFields]?: TFields
	readonly [privateCollectionIndexes]?: TIndexes
	readonly kind: 'private-collection'
}

type PrivateCollectionFieldMap<TCollection> =
	TCollection extends PrivateCollection<infer TFields> ? TFields : never

type PrivateCollectionIndexList<TCollection> =
	TCollection extends PrivateCollection<
		Readonly<Record<string, GenericField>>,
		infer TIndexes
	>
		? TIndexes
		: never

/** Resolves the complete immutable record stored for one private collection. */
export type PrivateCollectionRecord<TCollection extends PrivateCollection> =
	Readonly<FieldValueMap<PrivateCollectionFieldMap<TCollection>, 'object'>>

/** Resolves the exact create input, normalizing omitted optional fields to null. */
export type PrivateCollectionInsert<TCollection extends PrivateCollection> =
	Readonly<FieldValueMap<PrivateCollectionFieldMap<TCollection>, 'create'>>

/** Resolves the exact partial update accepted by one private collection. */
export type PrivateCollectionUpdate<TCollection extends PrivateCollection> =
	Readonly<FieldValueMap<PrivateCollectionFieldMap<TCollection>, 'update'>>

type UniqueWhereFromIndex<TRecord, TIndex> =
	TIndex extends PrivateCollectionUniqueIndex<
		Readonly<Record<string, GenericField>>,
		infer TNames
	>
		? Readonly<Pick<TRecord, Extract<TNames[number], keyof TRecord>>>
		: never

/** Resolves the closed union of exact unique selectors declared by a collection. */
export type PrivateCollectionUniqueWhere<
	TCollection extends PrivateCollection,
> = UniqueWhereFromIndex<
	PrivateCollectionRecord<TCollection>,
	PrivateCollectionIndexList<TCollection>[number]
>

/** Selects one private record through an exact declared unique index. */
export interface PrivateCollectionFindUniqueOptions<
	TCollection extends PrivateCollection,
> {
	readonly where: PrivateCollectionUniqueWhere<TCollection>
}

/** Inserts one complete private record after Core structural normalization. */
export interface PrivateCollectionInsertOptions<
	TCollection extends PrivateCollection,
> {
	readonly data: PrivateCollectionInsert<TCollection>
}

/** Updates at most one private record selected by an exact unique index. */
export interface PrivateCollectionUpdateOptions<
	TCollection extends PrivateCollection,
> {
	readonly data: PrivateCollectionUpdate<TCollection>
	readonly where: PrivateCollectionUniqueWhere<TCollection>
}

/** Deletes at most one private record selected by an exact unique index. */
export interface PrivateCollectionDeleteOptions<
	TCollection extends PrivateCollection,
> {
	readonly where: PrivateCollectionUniqueWhere<TCollection>
}

/** Applies one update only while every expected field still has its exact value. */
export interface PrivateCollectionCompareAndSwapOptions<
	TCollection extends PrivateCollection,
> extends PrivateCollectionUpdateOptions<TCollection> {
	readonly expected: Readonly<Partial<PrivateCollectionRecord<TCollection>>>
}

/** Exposes only the bounded v1 operations of one exact owner-private collection. */
export interface PrivateCollectionHandle<
	TCollection extends PrivateCollection = PrivateCollection,
> {
	findUnique(
		options: PrivateCollectionFindUniqueOptions<TCollection>,
	): Promise<PrivateCollectionRecord<TCollection> | null>
	insert(
		options: PrivateCollectionInsertOptions<TCollection>,
	): Promise<PrivateCollectionRecord<TCollection>>
	update(
		options: PrivateCollectionUpdateOptions<TCollection>,
	): Promise<PrivateCollectionRecord<TCollection> | null>
	delete(
		options: PrivateCollectionDeleteOptions<TCollection>,
	): Promise<PrivateCollectionRecord<TCollection> | null>
	compareAndSwap(
		options: PrivateCollectionCompareAndSwapOptions<TCollection>,
	): Promise<PrivateCollectionRecord<TCollection> | null>
}

/** Registers private collection tokens only during the declaring owner's static phase. */
export interface PrivateStorageDeclarationRegistrar {
	register(collection: PrivateCollection): void
}
