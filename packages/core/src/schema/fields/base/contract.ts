import type { DefaultFactory, FieldDefault } from './defaults.js'
import type {
	CompatiblePluginSourceFieldOptions,
	ResolveFieldSourceTemplate,
} from './source-options.js'

export type {
	CompatiblePluginSourceFieldOptions,
	FieldSourceObjectValue,
	FieldSourceOpaque,
	FieldSourceOptionByKind,
	FieldSourceApply,
	FieldSourceHKT,
	FieldSourcePresentValue,
	FieldSourceValue,
	PluginSourceFieldOption,
	PluginSourceFieldOptionConstraint,
	ResolveFieldSourceTemplate,
} from './source-options.js'

declare const fieldValueMarker: unique symbol
declare const fieldTypeStateMarker: unique symbol
declare const fieldStructuralContainsOperandMarker: unique symbol
declare const fieldContainsInputMarker: unique symbol
declare const fieldUpdateInputMarker: unique symbol
declare const fieldOptionsValueType: unique symbol
declare const fieldUniqueMarker: unique symbol
/** Resolves one source option template against the scalar or list field value. */
export type ResolvedFieldSourceOptions<
	TTemplate,
	TValue,
	TList extends FieldListOption,
	TRequired extends boolean = false,
> = Extract<
	ResolveFieldSourceTemplate<
		TTemplate,
		FieldListValue<TValue, TList>,
		TRequired extends true
			? FieldListValue<TValue, TList>
			: FieldListValue<TValue, TList> | null
	>,
	object
>

/** Carries one field scalar through plugin-owned option inference without Runtime data. */
export interface FieldOptionValueCarrier<TValue> {
	readonly [fieldOptionsValueType]?: TValue
}

/** The `indexed` option of a stored field: none, regular or unique. */
export type FieldIndexOption = boolean | 'unique'

/**
 * Marks a field declared with `indexed: 'unique'`: its equality alone is a
 * unique target of `updateOne`, `deleteOne` and `upsertOne` (ADR-0332). The
 * marker exists only in types; the field value never carries it.
 */
export interface UniqueFieldCarrier {
	readonly [fieldUniqueMarker]?: true
}

/** Tells whether a field type carries the unique-target marker. */
export type IsUniqueField<TField> =
	typeof fieldUniqueMarker extends keyof TField ? true : false

/** Adds the unique-target marker to a field declared with `indexed: 'unique'`. */
export type UniqueIndexedField<TIndexed, TField> = [TIndexed] extends ['unique']
	? TField & UniqueFieldCarrier
	: TField

/** Describes one homogeneous list wrapper around a field value. */
export type FieldList = true
export type FieldListOption = boolean

/** Describes whether one operation exposes a declared field property. */
export type FieldTypePresence = 'forbidden' | 'optional' | 'required'

/**
 * Carries only the normalized facts that affect operation-specific inference.
 * Runtime options remain available on the field without retaining their literals.
 */
export interface FieldTypeState {
	readonly create: FieldTypePresence
	readonly object: FieldTypePresence
	readonly update: Exclude<FieldTypePresence, 'required'>
	readonly nullable: boolean
	readonly list: FieldListOption
}

/** Builds the compact state shared by scalar fields without automatic generation. */
export interface ScalarFieldTypeState<
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
 * The non-null flag of a field with a default: a default makes a field
 * non-null unless it declares `nullable: true` (ADR-0340).
 */
export type DefaultedFieldNonNull<TNullable extends boolean> =
	TNullable extends true ? false : true

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

interface FieldMetadataOptions {
	/**
	 * Requires a non-null persisted value and, without a default or generator,
	 * requires the field in create input.
	 *
	 * @example `required: true`
	 */
	readonly required?: boolean
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
	TList extends FieldListOption = FieldListOption,
	TValue = unknown,
>
	extends FieldMetadataOptions, FieldOptionValueCarrier<TValue> {
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
	TList extends FieldListOption = FieldListOption,
> extends FieldOptionsBase<TList, TValue> {
	/**
	 * Provides a static value or a zero-argument factory evaluated for each
	 * created object. A defaulted field is non-null unless it declares
	 * `nullable: true`.
	 *
	 * @example `default: initialValue`
	 * @example `default: () => createInitialValue()`
	 */
	readonly default?: FieldDefault<FieldOptionsDefaultValue<TValue, TList>>
	/**
	 * Lets a field with a `default` hold `null`: an omitted value still gets
	 * the default, and explicit `null` is kept. Accepted only beside a default.
	 *
	 * @example `nullable: true`
	 */
	readonly nullable?: boolean
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

type SourceOptionKeys<TSourceOptions extends object> = keyof TSourceOptions

/**
 * Validates a factory's exact options against its scalar value.
 */
type FieldOptionsAreCompatible<TOptions extends object, TValue> =
	DefaultIsCompatible<
		TOptions,
		FieldOptionsValue<TValue, TOptions>
	> extends true
		? GeneratedValueIsCompatible<TOptions>
		: false

export type ValidatedFieldOptions<TOptions extends object, TValue> =
	FieldOptionsAreCompatible<TOptions, TValue> extends true ? TOptions : never

/** Narrows an exact factory input only when every installed type-only check accepts it. */
export type CompatibleFieldOptions<
	TOptions extends object,
	TValue,
> = 0 extends 1 & TOptions
	? unknown
	: ValidatedFieldOptions<TOptions, TValue> extends never
		? never
		: unknown

/** Retains an exact inferred input while applying every installed type-only check. */
export type CompatibleFieldOptionsInput<
	TOptions extends object,
	TValue,
	TAllowedOptions extends object = TOptions,
> = TOptions &
	(Exclude<keyof TOptions, keyof TAllowedOptions> extends never
		? unknown
		: never) &
	CompatibleFieldOptions<TOptions, TValue>

/** Infers exact plugin-option values while rejecting keys no installed plugin declares. */
export type CompatibleFieldOptionsExtension<
	TBaseOptions extends object,
	TExtensionOptions extends object,
	TValue,
	TSourceOptions extends object = Readonly<Record<never, never>>,
> = [SourceOptionKeys<TSourceOptions>] extends [never]
	? TBaseOptions
	: Omit<TBaseOptions, keyof TSourceOptions> &
			TSourceOptions &
			TExtensionOptions &
			(Exclude<
				keyof TExtensionOptions,
				keyof TBaseOptions | keyof TSourceOptions
			> extends never
				? unknown
				: never) &
			CompatiblePluginSourceFieldOptions<
				TSourceOptions,
				TBaseOptions & TExtensionOptions,
				TValue
			>

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

type FieldOptionsAreNullable<TOptions> = TOptions extends {
	readonly nullable: true
}
	? true
	: false

// A default, like a generator, makes a field non-null unless it declares
// `nullable: true` (ADR-0340).
type ResolveNullability<TOptions> =
	FieldOptionsAreNullable<TOptions> extends true
		? true
		: FieldOptionsRequired<TOptions> extends true
			? false
			: FieldOptionsHaveDefault<TOptions> extends true
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
export interface ResolveFieldTypeState<TOptions extends object> {
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
	TOptions extends object = FieldOptions<TValue>,
	TState extends FieldTypeState = ResolveFieldTypeState<TOptions>,
	TStructuralContainsOperand = never,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [fieldValueMarker]?: TValue
	readonly [fieldTypeStateMarker]?: TState
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

/**
 * Declares the developer operand of one plugin `contains` filter on a field
 * type, so a source schema types it exactly without generated declarations
 * (ADR-0297). The structural operand above is the snapshot output, which can
 * differ from what developers write.
 */
export interface FieldContainsInputCarrier<TInput> {
	readonly [fieldContainsInputMarker]?: TInput
}

/**
 * Declares an extra value a plugin field accepts in update data besides its
 * own value, such as ACL's `{ grant }` (ADR-0321). The owning plugin turns it
 * into a field value inside the singular prepared update; storage never sees it.
 */
export interface FieldUpdateInputCarrier<TInput> {
	readonly [fieldUpdateInputMarker]?: TInput
}

/** Extracts the extra update input a field type declares, if any. */
export type FieldUpdateInput<TField> = TField extends {
	readonly [fieldUpdateInputMarker]?: infer TInput
}
	? TInput
	: never

/** Extracts the developer `contains` operand a field type declares, if any. */
export type FieldContainsInput<TField> = TField extends {
	readonly [fieldContainsInputMarker]?: infer TInput
}
	? TInput
	: never

/** Extracts the compact operation state carried by a declared field. */
export type FieldTypeStateOf<TField> = TField extends {
	readonly [fieldTypeStateMarker]?: infer TState extends FieldTypeState
}
	? TState
	: never

/** Mirrors a Runtime-owned mutation-input prohibition in source inference. */
export type ForbiddenMutationInputField<TField extends GenericField> =
	TField extends FieldDefinition<
		infer TKind,
		infer TValue,
		infer TOptions,
		infer TState,
		infer TStructuralContainsOperand
	>
		? FieldDefinition<
				TKind,
				TValue,
				TOptions,
				Omit<TState, 'create' | 'update'> &
					Readonly<{ create: 'forbidden'; update: 'forbidden' }>,
				TStructuralContainsOperand
			> &
				// A unique field stays a unique target (ADR-0332).
				(IsUniqueField<TField> extends true ? UniqueFieldCarrier : unknown)
		: TField

/** Extracts the complete value carried by a field and its list metadata. */
export type FieldValue<TField> = FieldListValue<
	FieldScalarValue<TField>,
	FieldTypeStateOf<TField>['list']
>
