import type { GenericField, SchemaDefinition } from '@ultimabase/core'

/** Reads a field's validator; the option normalizer is its only writer. */
export const readFieldValidator = (field: GenericField): unknown =>
	Reflect.get(field.options, 'validation')

/** Reads a schema's `validation` rule; the option normalizer is its only writer. */
export const readSchemaValidation = (schema: SchemaDefinition): unknown =>
	Object.hasOwn(schema.definition, 'validation')
		? Reflect.get(schema.definition, 'validation')
		: undefined
