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
