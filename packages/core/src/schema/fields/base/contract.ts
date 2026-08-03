import type { FieldExtension } from '../../extensions/definition.js'
import type { DefaultFactory, FieldDefault } from './defaults.js'

declare const fieldValueMarker: unique symbol
declare const fieldInferenceMarker: unique symbol

/**
 * Describes one or more homogeneous list wrappers around a field value.
 */
export type FieldList = true | readonly [true, ...true[]]
export type FieldListOption = false | FieldList

/** Describes whether one operation exposes a declared field property. */
export type FieldInferencePresence = 'forbidden' | 'optional' | 'required'

/**
 * Carries only the normalized facts that affect operation-specific inference.
 * Runtime options remain available on the field without retaining their literals.
 */
export interface FieldInferenceState {
	readonly create: FieldInferencePresence
	readonly object: FieldInferencePresence
	readonly update: Exclude<FieldInferencePresence, 'required'>
	readonly nullable: boolean
	readonly list: FieldListOption
}

/** Builds the compact state shared by scalar fields without automatic generation. */
export interface ScalarFieldInferenceState<
	TRequired extends boolean,
	TNullable extends boolean,
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
	readonly object: THasGeneratedValue extends true
		? 'required'
		: TRequired extends true
			? 'required'
			: THasDefault extends true
				? 'required'
				: 'optional'
	readonly update: TImmutable extends true ? 'forbidden' : 'optional'
	readonly nullable: TNullable
	readonly list: TList
}

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
export interface FieldValidationOptions {
	/**
	 * Requires the field to receive a value during creation when enabled.
	 *
	 * @example `validation: { required: true }`
	 */
	readonly required?: boolean
	/**
	 * Allows an explicit `null` value. It cannot be enabled together with `required`.
	 *
	 * @example `validation: { nullable: true }`
	 */
	readonly nullable?: boolean
}

interface FieldMetadataOptions<TValidation extends FieldValidationOptions> {
	/**
	 * Groups presence rules and field-specific constraints validated by Runtime.
	 *
	 * @example `validation: { required: true }`
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
	/**
	 * Attaches immutable metadata owned and interpreted by installed field plugins.
	 *
	 * @example `extensions: [myFieldExtension]`
	 */
	readonly extensions?: readonly FieldExtension<string, object>[]
}

/** Defines shared field metadata without assigning a default-value contract. */
export interface FieldOptionsBase<
	TValidation extends FieldValidationOptions = FieldValidationOptions,
	TList extends FieldListOption = FieldListOption,
> extends FieldMetadataOptions<TValidation> {
	/**
	 * Wraps the scalar in one or more list dimensions. `true` creates one dimension.
	 *
	 * @example `list: true`
	 * @example `list: [true, true]` creates a two-dimensional list.
	 */
	readonly list?: TList
}

/**
 * Defines metadata shared by every field kind without introducing storage concerns.
 */
export interface FieldOptions<
	TValue,
	TValidation extends FieldValidationOptions = FieldValidationOptions,
	TList extends FieldListOption = FieldListOption,
> extends FieldOptionsBase<TValidation, TList> {
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

type PresenceIsCompatible<TOptions> = TOptions extends {
	readonly validation: infer TValidation
}
	? TValidation extends { readonly required: true; readonly nullable: true }
		? false
		: true
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
		? PresenceIsCompatible<TOptions> extends true
			? GeneratedValueIsCompatible<TOptions>
			: false
		: false

export type ValidatedFieldOptions<TOptions extends object, TValue> =
	FieldOptionsAreCompatible<TOptions, TValue> extends true ? TOptions : never

/** Converts a failed type-level validation into an impossible call argument. */
export type InvalidOptionsArguments<TValidatedOptions> = [
	TValidatedOptions,
] extends [never]
	? [invalidOptions: never]
	: []

type FieldOptionsList<TOptions> = TOptions extends {
	readonly list: infer TList extends FieldList
}
	? TList
	: false

type FieldOptionsNullable<TOptions> = TOptions extends {
	readonly validation: { readonly nullable: true }
}
	? true
	: false

type FieldOptionsRequired<TOptions> = TOptions extends {
	readonly validation: { readonly required: true }
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

type ResolveObjectPresence<TOptions> =
	FieldOptionsRequired<TOptions> extends true
		? 'required'
		: FieldOptionsHaveDefault<TOptions> extends true
			? 'required'
			: FieldOptionsHaveAutoNow<TOptions> extends true
				? 'required'
				: FieldOptionsAreAutoIncremented<TOptions> extends true
					? 'required'
					: FieldOptionsAreGenerated<TOptions> extends true
						? 'required'
						: 'optional'

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

/** Converts exact legacy options into the compact field inference contract. */
export interface ResolveFieldInferenceState<TOptions extends object> {
	readonly create: ResolveCreatePresence<TOptions>
	readonly object: ResolveObjectPresence<TOptions>
	readonly update: ResolveUpdatePresence<TOptions>
	readonly nullable: FieldOptionsNullable<TOptions>
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
	TOptions extends object = FieldOptions<TValue>,
	TInference extends FieldInferenceState = ResolveFieldInferenceState<TOptions>,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [fieldValueMarker]?: TValue
	readonly [fieldInferenceMarker]?: TInference
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

/** Extracts the compact operation state carried by a declared field. */
export type FieldInferenceStateOf<TField> = TField extends {
	readonly [fieldInferenceMarker]?: infer TInference extends FieldInferenceState
}
	? TInference
	: never

/** Extracts the complete value carried by a field and its list metadata. */
export type FieldValue<TField> = FieldListValue<
	FieldScalarValue<TField>,
	FieldInferenceStateOf<TField>['list']
>
