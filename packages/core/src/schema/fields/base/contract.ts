import type { UltimaBaseGeneratedFieldOptions } from '../../type-info.js'
import type { DefaultFactory, FieldDefault } from './defaults.js'
import type {
	CompatibleFieldStandardSchema,
	FieldStandardSchema,
} from './standard-schema.js'

declare const fieldValueMarker: unique symbol
declare const fieldTypegenMarker: unique symbol
declare const fieldStructuralContainsOperandMarker: unique symbol
declare const fieldOptionsValueType: unique symbol

/** Carries one field scalar through plugin-owned option inference without Runtime data. */
export interface FieldOptionValueCarrier<TValue> {
	readonly [fieldOptionsValueType]?: TValue
}

/** Describes one homogeneous list wrapper around a field value. */
export type FieldList = true
export type FieldListOption = boolean

/** Describes whether one operation exposes a declared field property. */
export type FieldTypegenPresence = 'forbidden' | 'optional' | 'required'

/**
 * Carries only the normalized facts that affect operation-specific inference.
 * Runtime options remain available on the field without retaining their literals.
 */
export interface FieldTypegenState {
	readonly create: FieldTypegenPresence
	readonly object: FieldTypegenPresence
	readonly update: Exclude<FieldTypegenPresence, 'required'>
	readonly nullable: boolean
	readonly list: FieldListOption
}

/** Builds the compact state shared by scalar fields without automatic generation. */
export interface ScalarFieldTypegenState<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	THasGeneratedValue extends boolean = false,
> {
	readonly create: THasGeneratedValue extends true
		? 'optional'
		: TRequired extends true
			? THasDefault extends true
				? 'optional'
				: 'required'
			: 'optional'
	readonly object: 'required'
	readonly update: TImmutable extends true ? 'forbidden' : 'optional'
	// Optional persisted fields use canonical null; generated values remain non-null.
	readonly nullable: TRequired extends true
		? false
		: THasGeneratedValue extends true
			? false
			: true
	readonly list: TList
}

/**
 * Applies the optional one-dimensional list wrapper to a field's scalar value.
 */
export type FieldListValue<TValue, TList> = TList extends true
	? readonly TValue[]
	: TValue

/**
 * Derives the complete value from one field's scalar type and exact options.
 */
export type FieldOptionsValue<TValue, TOptions> = FieldListValue<
	TValue,
	TOptions extends { readonly list: infer TList } ? TList : false
>

type FieldOptionsDefaultValue<
	TValue,
	TList extends FieldListOption,
> = FieldListOption extends TList
	? TValue | readonly TValue[]
	: FieldListValue<TValue, TList>

interface FieldMetadataOptions<TValidation extends object> {
	/**
	 * Requires a non-null persisted value and, without a default or generator,
	 * requires the field in create input.
	 *
	 * @example `required: true`
	 */
	readonly required?: boolean
	/**
	 * Applies one synchronous Standard Schema validator to the complete canonical value.
	 *
	 * @example `validation: z.string().min(1)`
	 */
	readonly validation?: TValidation
	/**
	 * Prevents the field from appearing in update inputs after it is created.
	 *
	 * @example `immutable: true`
	 */
	readonly immutable?: boolean
	/**
	 * Requests a regular index with `true`, a unique index with `"unique"`, or no index with `false`.
	 *
	 * @example `indexed: "unique"`
	 */
	readonly indexed?: boolean | 'unique'
	/**
	 * Supplies human-readable field documentation for generators and developer tooling.
	 *
	 * @example `description: "Public display name"`
	 */
	readonly description?: string
}

/** Defines shared field metadata without assigning a default-value contract. */
export interface FieldOptionsBase<
	TValidation extends object = FieldStandardSchema,
	TList extends FieldListOption = FieldListOption,
	TValue = unknown,
>
	extends
		FieldMetadataOptions<TValidation>,
		FieldOptionValueCarrier<TValue>,
		UltimaBaseGeneratedFieldOptions {
	/**
	 * Wraps the scalar in one homogeneous list when enabled.
	 *
	 * @example `list: true`
	 */
	readonly list?: TList
}

/**
 * Defines metadata shared by every field kind without introducing storage concerns.
 */
export interface FieldOptions<
	TValue,
	TValidation extends object = FieldStandardSchema,
	TList extends FieldListOption = FieldListOption,
> extends FieldOptionsBase<TValidation, TList, TValue> {
	/**
	 * Provides a static value or a zero-argument factory evaluated for each created object.
	 *
	 * @example `default: initialValue`
	 * @example `default: () => createInitialValue()`
	 */
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

type GeneratedValueIsCompatible<TOptions> = TOptions extends {
	readonly autoNow: true
}
	? TOptions extends { readonly default: unknown }
		? false
		: TOptions extends { readonly list: FieldList }
			? false
			: true
	: true

/**
 * Validates a factory's exact options against its scalar value and validation contract.
 */
type FieldOptionsAreCompatible<TOptions extends object, TValue> =
	DefaultIsCompatible<
		TOptions,
		FieldOptionsValue<TValue, TOptions>
	> extends true
		? GeneratedValueIsCompatible<TOptions>
		: false

type FieldValidationIsCompatible<
	TOptions extends object,
	TValue,
> = TOptions extends { readonly validation: infer TValidation }
	? TValidation extends FieldStandardSchema
		? TValidation extends CompatibleFieldStandardSchema<
				TValidation,
				FieldOptionsValue<TValue, TOptions>,
				TOptions extends { readonly list: true } ? TValue[] : TValue
			>
			? true
			: false
		: false
	: true

export type ValidatedFieldOptions<TOptions extends object, TValue> =
	FieldOptionsAreCompatible<TOptions, TValue> extends true
		? FieldValidationIsCompatible<TOptions, TValue> extends true
			? TOptions
			: never
		: never

type FieldOptionsList<TOptions> = TOptions extends {
	readonly list: infer TList extends FieldList
}
	? TList
	: false

type FieldOptionsRequired<TOptions> = TOptions extends {
	readonly required: true
}
	? true
	: false

type FieldOptionsHaveDefault<TOptions> = TOptions extends {
	readonly default: unknown
}
	? true
	: false

type FieldOptionsHaveAutoNow<TOptions> = TOptions extends {
	readonly autoNow: true
}
	? true
	: false

type FieldOptionsAreAutoIncremented<TOptions> = TOptions extends {
	readonly autoIncrement: true
}
	? true
	: false

type FieldOptionsAreGenerated<TOptions> = TOptions extends {
	readonly generatedOn: unknown
}
	? true
	: false

type FieldOptionsAreImmutable<TOptions> = TOptions extends {
	readonly immutable: true
}
	? true
	: false

type ResolveObjectPresence = 'required'

type ResolveNullability<TOptions> =
	FieldOptionsRequired<TOptions> extends true
		? false
		: FieldOptionsHaveAutoNow<TOptions> extends true
			? false
			: FieldOptionsAreAutoIncremented<TOptions> extends true
				? false
				: FieldOptionsAreGenerated<TOptions> extends true
					? false
					: true

type ResolveCreatePresence<TOptions> =
	FieldOptionsAreGenerated<TOptions> extends true
		? 'forbidden'
		: FieldOptionsRequired<TOptions> extends true
			? FieldOptionsHaveDefault<TOptions> extends true
				? 'optional'
				: FieldOptionsHaveAutoNow<TOptions> extends true
					? 'optional'
					: FieldOptionsAreAutoIncremented<TOptions> extends true
						? 'optional'
						: 'required'
			: 'optional'

type ResolveUpdatePresence<TOptions> =
	FieldOptionsAreGenerated<TOptions> extends true
		? 'forbidden'
		: FieldOptionsAreImmutable<TOptions> extends true
			? 'forbidden'
			: 'optional'

/** Converts exact field options into the compact field inference contract. */
export interface ResolveFieldTypegenState<TOptions extends object> {
	readonly create: ResolveCreatePresence<TOptions>
	readonly object: ResolveObjectPresence
	readonly update: ResolveUpdatePresence<TOptions>
	readonly nullable: ResolveNullability<TOptions>
	readonly list: FieldOptionsList<TOptions>
}

/**
 * Carries immutable field metadata and its value type through schema inference.
 *
 * The symbol property exists only at the type level and does not add runtime metadata.
 */
export interface FieldDefinition<
	TKind extends string,
	TValue,
	TOptions extends object = FieldOptions<TValue, object>,
	TTypegen extends FieldTypegenState = ResolveFieldTypegenState<TOptions>,
	TStructuralContainsOperand = never,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [fieldValueMarker]?: TValue
	readonly [fieldTypegenMarker]?: TTypegen
	readonly [fieldStructuralContainsOperandMarker]?: TStructuralContainsOperand
}

/**
 * Describes a concrete field through one shared reusable boundary.
 */
export interface GenericField {
	readonly kind: string
	readonly options: Readonly<object>
	readonly [fieldValueMarker]?: unknown
}

/**
 * Extracts the logical scalar carried by a field before list metadata applies.
 */
export type FieldScalarValue<TField> = TField extends {
	readonly [fieldValueMarker]?: infer TValue
}
	? TValue
	: unknown

/** Extracts the exact partial operand accepted by plugin-owned structural containment. */
export type FieldStructuralContainsOperand<TField> = TField extends {
	readonly [fieldStructuralContainsOperandMarker]?: infer TOperand
}
	? TOperand
	: never

/** Extracts the compact operation state carried by a declared field. */
export type FieldTypegenStateOf<TField> = TField extends {
	readonly [fieldTypegenMarker]?: infer TTypegen extends FieldTypegenState
}
	? TTypegen
	: never

/** Extracts the complete value carried by a field and its list metadata. */
export type FieldValue<TField> = FieldListValue<
	FieldScalarValue<TField>,
	FieldTypegenStateOf<TField>['list']
>
