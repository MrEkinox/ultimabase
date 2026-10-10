import type { PointerLinkInput } from '../nested-writes/inputs.js'
import type { PointerValue } from '../relations/pointer.js'
import type { SchemaTypeInfoSource, SchemaTypeValue } from '../type-info.js'

/** Reads the persisted item shape owned by one generated schema contract. */
export type SchemaItem<TSchema extends SchemaTypeInfoSource> = SchemaTypeValue<
	TSchema,
	'Item'
>

/** Reads the complete caller-visible result shape owned by one schema contract. */
export type SchemaOutput<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Output'>

/** Reads create data owned by one generated schema contract. */
export type SchemaCreateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Create'>

/** Reads update data owned by one generated schema contract. */
export type SchemaUpdateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Update'>

/** Stores a `{ connect }` link as the Pointer it names (ADR-0308). */
type SchemaStoredValue<TValue> =
	TValue extends PointerLinkInput<infer TLink>
		? Extract<TLink, PointerValue>
		: TValue

/** Mutation data as normalized operations carry it: links are stored Pointers. */
export type SchemaStoredData<TData> = {
	readonly [TKey in keyof TData]: SchemaStoredValue<TData[TKey]>
}

/** Create data as normalized operations carry it (ADR-0308). */
export type SchemaStoredCreateData<TSchema extends SchemaTypeInfoSource> =
	SchemaStoredData<SchemaCreateData<TSchema>>

/** Update data as normalized operations carry it (ADR-0308). */
export type SchemaStoredUpdateData<TSchema extends SchemaTypeInfoSource> =
	SchemaStoredData<SchemaUpdateData<TSchema>>
