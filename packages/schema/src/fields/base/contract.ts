import type { FieldExtension } from '../../extensions/definition.js'
import type { DefaultFactory, FieldDefault } from './defaults.js'

declare const fieldValueMarker: unique symbol

/**
 * Describes one or more homogeneous list wrappers around a field value.
 */
export type FieldList = true | readonly [true, ...true[]]
export type FieldListOption = false | FieldList

type ApplyFieldListTuple<
	TValue,
	TList extends readonly true[],
> = TList extends readonly [true, ...infer TRest extends readonly true[]]
	? readonly ApplyFieldListTuple<TValue, TRest>[]
	: TValue

/**
 * Applies declarative list metadata to one field's scalar value.
 */
export type FieldListValue<TValue, TList> = TList extends true
	? readonly TValue[]
	: TList extends readonly true[]
		? ApplyFieldListTuple<TValue, TList>
		: TValue

/**
 * Derives the complete value from one field's scalar type and exact options.
 */
export type FieldOptionsValue<TValue, TOptions> = FieldListValue<
	TValue,
	TOptions extends { readonly list: infer TList } ? TList : false
>

type RecursiveFieldListValue<TValue> =
	TValue | readonly RecursiveFieldListValue<TValue>[]

type FieldOptionsDefaultValue<
	TValue,
	TList extends FieldListOption,
> = FieldListOption extends TList
	? RecursiveFieldListValue<TValue>
	: FieldListValue<TValue, TList>

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

interface FieldMetadataOptions<TValidation extends FieldValidationOptions> {
	readonly validation?: TValidation
	readonly immutable?: boolean
	readonly indexed?: boolean | 'unique'
	readonly description?: string
	readonly extensions?: readonly FieldExtension<string, object>[]
}

/**
 * Defines metadata shared by every field kind without introducing storage concerns.
 */
export type FieldOptions<
	TValue,
	TValidation extends FieldValidationOptions = FieldValidationOptions,
	TList extends FieldListOption = FieldListOption,
> = FieldMetadataOptions<TValidation> & {
	readonly list?: TList
	readonly default?: FieldDefault<FieldOptionsDefaultValue<TValue, TList>>
}

type DefaultIsCompatible<TOptions, TValue> = TOptions extends {
	readonly default: infer TDefault
}
	? TDefault extends (...args: never[]) => unknown
		? TDefault extends DefaultFactory<TValue>
			? true
			: false
		: TDefault extends TValue
			? true
			: false
	: true

/**
 * Validates a factory's exact options against its scalar value and validation contract.
 */
export type ValidatedFieldOptions<TOptions extends object, TValue> =
	DefaultIsCompatible<
		TOptions,
		FieldOptionsValue<TValue, TOptions>
	> extends true
		? TOptions
		: never

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
 * Extracts the logical scalar carried by a field before list metadata applies.
 */
export type FieldScalarValue<TField> = TField extends {
	readonly [fieldValueMarker]?: infer TValue
}
	? TValue
	: unknown

/** Extracts the complete value carried by a field and its list metadata. */
export type FieldValue<TField> = TField extends {
	readonly options: infer TOptions
}
	? FieldOptionsValue<FieldScalarValue<TField>, TOptions>
	: unknown
