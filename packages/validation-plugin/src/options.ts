import {
	defineSchemaOption,
	type FieldOptionValueCarrier,
	type FieldOptionsValue,
	type SchemaOptionDefinition,
} from '@ultimabase/core'

import {
	assertFieldStandardSchema,
	type CompatibleFieldStandardSchema,
	type FieldStandardSchema,
	type MutableFieldContainer,
} from './standard-schema.js'

type FieldOptionInput<TOptions> = Omit<TOptions, 'validation'>

type FieldScalarForOptions<TOptions> =
	FieldOptionInput<TOptions> extends FieldOptionValueCarrier<infer TValue>
		? TValue
		: never

/**
 * Adds one Standard Schema V1 validator for a field's complete canonical value.
 *
 * `required` remains an independent Core option. Validation runs only for a
 * present non-null value when `validationPlugin()` is installed.
 *
 * @example
 * ```ts
 * title: field.string({
 *   required: true,
 *   validation: z.string().min(1),
 * })
 * ```
 */
export type FieldValidationOption<TOptions> = [
	FieldScalarForOptions<TOptions>,
] extends [never]
	? never
	: FieldStandardSchema

/** Checks the exact inferred validator contract without adding Runtime behavior to Core. */
export type FieldValidationCompatibility<TOptions extends object, TValue> = [
	TValue,
] extends [never]
	? false
	: TOptions extends { readonly validation: infer TSchema }
		? TSchema extends FieldStandardSchema
			? CompatibleFieldStandardSchema<
					TSchema,
					FieldOptionsValue<TValue, TOptions>,
					MutableFieldContainer<FieldOptionsValue<TValue, TOptions>>
				> extends never
				? false
				: true
			: false
		: true

/** Owns the direct `validation` field option as an opaque executable artifact. */
export const fieldValidationOption: SchemaOptionDefinition<FieldStandardSchema> =
	defineSchemaOption({
		normalize: (value) => {
			assertFieldStandardSchema(value)
			return value
		},
		protocolVersion: 1,
		typegen: {
			compatibilityType: 'FieldValidationCompatibility',
			generic: 'self',
			module: '@ultimabase/validation-plugin',
			type: 'FieldValidationOption',
		},
		valueKind: 'opaque',
	})
