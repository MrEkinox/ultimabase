import type { FieldExtension } from './extension.js'
import type { FieldDefault } from './default-value.js'

declare const fieldValueMarker: unique symbol

/**
 * Describes whether a field may be omitted or contain null.
 *
 * Optional fields remain non-null by default, while required fields can never be nullable.
 */
export type FieldValidationOptions =
	| {
			readonly required: true
			readonly nullable?: false
	  }
	| {
			readonly required?: false
			readonly nullable?: boolean
	  }

/**
 * Defines metadata shared by every field kind without introducing storage concerns.
 */
export interface FieldOptions<
	TValue,
	TValidation extends FieldValidationOptions = FieldValidationOptions,
> {
	readonly validation?: TValidation
	readonly default?: FieldDefault<TValue>
	readonly immutable?: boolean
	readonly indexed?: boolean | 'unique'
	readonly description?: string
	readonly extensions?: readonly FieldExtension<string, object>[]
}

/**
 * Carries immutable field metadata and its value type through schema inference.
 *
 * The symbol property exists only at the type level and does not add runtime metadata.
 */
export interface FieldDefinition<
	TKind extends string,
	TValue,
	TOptions extends object = FieldOptions<TValue>,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [fieldValueMarker]?: TValue
}

/**
 * Describes a concrete field through one shared reusable boundary.
 */
export type GenericField = FieldDefinition<string, unknown, object>

/**
 * Extracts the value carried by a field without constraining its exact options.
 */
export type FieldValue<TField> = TField extends {
	readonly [fieldValueMarker]?: infer TValue
}
	? TValue
	: unknown
