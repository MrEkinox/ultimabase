import type { SchemaTypeValue } from '../type-info.js'
import type { SchemaDefinition } from './definition.js'

/** Reads the persisted item shape owned by one generated schema contract. */
export type SchemaItem<TSchema extends SchemaDefinition> = SchemaTypeValue<
	TSchema,
	'Item'
>

/** Reads create data owned by one generated schema contract. */
export type SchemaCreateData<TSchema extends SchemaDefinition> =
	SchemaTypeValue<TSchema, 'Create'>

/** Reads update data owned by one generated schema contract. */
export type SchemaUpdateData<TSchema extends SchemaDefinition> =
	SchemaTypeValue<TSchema, 'Update'>
