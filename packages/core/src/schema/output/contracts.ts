import type { JsonDocument } from '../fields/builtins/json.js'
import type { EnumValue, EnumValues } from '../fields/builtins/enum.js'
import type {
	UltimaBaseGeneratedOutputBuilderMethods,
	UltimaBaseGeneratedOutputOptions,
} from '../type-info.js'

declare const outputValueMarker: unique symbol

/** Lists the transport-neutral value kinds available to virtual outputs. */
export type OutputKind =
	| 'bigint'
	| 'binary'
	| 'boolean'
	| 'date'
	| 'dateTime'
	| 'decimal'
	| 'enum'
	| 'float'
	| 'int'
	| 'json'
	| 'object'
	| 'string'
	| 'time'
	| 'uuid'

/** Describes value shape without persisted-input or storage behavior. */
export interface OutputValueOptions<
	TNullable extends boolean = boolean,
	TList extends boolean = boolean,
> extends UltimaBaseGeneratedOutputOptions {
	/** Supplies human-readable output documentation. @example `description: "Display name"` */
	readonly description?: string
	/** Wraps the complete value in one homogeneous list. @example `list: true` */
	readonly list?: TList
	/** Allows the complete value or list container to be `null`. @example `nullable: false` */
	readonly nullable?: TNullable
}

/** Carries explicit defaults after one output declaration is normalized. */
export interface NormalizedOutputValueOptions<
	TNullable extends boolean = boolean,
	TList extends boolean = boolean,
> {
	readonly description?: string
	readonly list: TList
	readonly nullable: TNullable
}

/** Applies list shape first and complete-value nullability second. */
export type OutputValueShape<
	TValue,
	TNullable extends boolean,
	TList extends boolean,
> =
	| (TList extends true ? readonly TValue[] : TValue)
	| (TNullable extends true ? null : never)

/** Describes one immutable logical output without creating a stored field. */
export interface OutputDescriptor<
	TKind extends string = string,
	TValue = unknown,
	TOptions extends NormalizedOutputValueOptions = NormalizedOutputValueOptions,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [outputValueMarker]: TValue
}

/** Accepts any genuine Core or future plugin-owned output descriptor. */
export type GenericOutputDescriptor = OutputDescriptor

/** Recovers the complete nullable and list-aware value of one descriptor. */
export type OutputValue<TOutput extends GenericOutputDescriptor> =
	TOutput[typeof outputValueMarker]

/** Names one recursively declared output object property map. */
export type OutputFields = Readonly<Record<string, GenericOutputDescriptor>>

/** Builds an exact object whose properties are always present. */
export type OutputObjectValue<TFields extends OutputFields> =
	OutputFields extends TFields
		? Readonly<Record<string, unknown>>
		: { readonly [TName in keyof TFields]: OutputValue<TFields[TName]> }

type ScalarOutputDescriptor<
	TKind extends Exclude<OutputKind, 'enum' | 'object'>,
	TValue,
	TRepresentationOptions extends object,
	TNullable extends boolean,
	TList extends boolean,
> = OutputDescriptor<
	TKind,
	OutputValueShape<TValue, TNullable, TList>,
	NormalizedOutputValueOptions<TNullable, TList> & TRepresentationOptions
>

interface OutputScalarBuilderMethod<
	TKind extends Exclude<OutputKind, 'enum' | 'object'>,
	TValue,
	TRepresentationOptions extends object = object,
> {
	/** Declares one non-null scalar output value. */
	(
		options: OutputValueOptions<false, false> &
			TRepresentationOptions & {
				readonly list?: false
				readonly nullable: false
			},
	): ScalarOutputDescriptor<TKind, TValue, TRepresentationOptions, false, false>
	(
		options: OutputValueOptions<false, true> &
			TRepresentationOptions & {
				readonly list: true
				readonly nullable: false
			},
	): ScalarOutputDescriptor<TKind, TValue, TRepresentationOptions, false, true>
	(
		options: OutputValueOptions<true, true> &
			TRepresentationOptions & {
				readonly list: true
				readonly nullable?: true
			},
	): ScalarOutputDescriptor<TKind, TValue, TRepresentationOptions, true, true>
	(
		options?: OutputValueOptions<true, false> &
			TRepresentationOptions & {
				readonly list?: false
				readonly nullable?: true
			},
	): ScalarOutputDescriptor<TKind, TValue, TRepresentationOptions, true, false>
	<const TNullable extends boolean, const TList extends boolean>(
		options: OutputValueOptions<TNullable, TList> & TRepresentationOptions,
	): ScalarOutputDescriptor<
		TKind,
		TValue,
		TRepresentationOptions,
		TNullable,
		TList
	>
}

/** Adds exact decimal validation and representation metadata. */
export interface DecimalOutputRepresentationOptions {
	/** Limits total integer and fractional digits. @example `precision: 12` */
	readonly precision?: number
	/** Limits digits after the decimal separator. @example `scale: 2` */
	readonly scale?: number
}

/** Adds timezone representation to time-bearing values. */
export interface TemporalOutputRepresentationOptions {
	/** Selects a timezone-bearing representation. @example `timezone: false` */
	readonly timezone?: boolean
}

/** Describes one exact output enum domain. */
export interface EnumOutputOptions<
	TValues extends EnumValues,
	TNullable extends boolean = boolean,
	TList extends boolean = boolean,
> extends OutputValueOptions<TNullable, TList> {
	/** Supplies a stable generator-neutral type identity. @example `typeName: "Status"` */
	readonly typeName?: string
	/** Declares the non-empty set of accepted string values. @example `values: ["draft"]` */
	readonly values: TValues
}

type EnumOutputDescriptor<
	TValues extends EnumValues,
	TNullable extends boolean,
	TList extends boolean,
> = OutputDescriptor<
	'enum',
	OutputValueShape<EnumValue<TValues>, TNullable, TList>,
	NormalizedOutputValueOptions<TNullable, TList> & {
		readonly typeName?: string
		readonly values: TValues
	}
>

interface OutputEnumBuilderMethod {
	/** Declares one non-null output value from an exact enum domain. */
	<const TValues extends EnumValues>(
		options: EnumOutputOptions<TValues, false, false> & {
			readonly list?: false
			readonly nullable: false
		},
	): EnumOutputDescriptor<TValues, false, false>
	<const TValues extends EnumValues>(
		options: EnumOutputOptions<TValues, false, true> & {
			readonly list: true
			readonly nullable: false
		},
	): EnumOutputDescriptor<TValues, false, true>
	<const TValues extends EnumValues>(
		options: EnumOutputOptions<TValues, true, true> & {
			readonly list: true
			readonly nullable?: true
		},
	): EnumOutputDescriptor<TValues, true, true>
	<const TValues extends EnumValues>(
		options: EnumOutputOptions<TValues, true, false> & {
			readonly list?: false
			readonly nullable?: true
		},
	): EnumOutputDescriptor<TValues, true, false>
	<
		const TValues extends EnumValues,
		const TNullable extends boolean,
		const TList extends boolean,
	>(
		options: EnumOutputOptions<TValues, TNullable, TList>,
	): EnumOutputDescriptor<TValues, TNullable, TList>
}

/** Describes one recursively named output object. */
export interface ObjectOutputOptions<
	TFields extends OutputFields,
	TNullable extends boolean = boolean,
	TList extends boolean = boolean,
> extends OutputValueOptions<TNullable, TList> {
	/** Declares every required property through the same output-only builder. */
	readonly fields: (output: OutputBuilder) => TFields
	/** Supplies a stable generator-neutral object identity. @example `typeName: "Summary"` */
	readonly typeName?: string
}

type ObjectOutputDescriptor<
	TFields extends OutputFields,
	TNullable extends boolean,
	TList extends boolean,
> = OutputDescriptor<
	'object',
	OutputValueShape<OutputObjectValue<TFields>, TNullable, TList>,
	NormalizedOutputValueOptions<TNullable, TList> & {
		readonly fields: TFields
		readonly typeName?: string
	}
>

interface OutputObjectBuilderMethod {
	/** Describes one non-null object whose properties are output descriptors. */
	<const TFields extends OutputFields>(
		options: ObjectOutputOptions<TFields, false, false> & {
			readonly list?: false
			readonly nullable: false
		},
	): ObjectOutputDescriptor<TFields, false, false>
	<const TFields extends OutputFields>(
		options: ObjectOutputOptions<TFields, false, true> & {
			readonly list: true
			readonly nullable: false
		},
	): ObjectOutputDescriptor<TFields, false, true>
	<const TFields extends OutputFields>(
		options: ObjectOutputOptions<TFields, true, true> & {
			readonly list: true
			readonly nullable?: true
		},
	): ObjectOutputDescriptor<TFields, true, true>
	<const TFields extends OutputFields>(
		options: ObjectOutputOptions<TFields, true, false> & {
			readonly list?: false
			readonly nullable?: true
		},
	): ObjectOutputDescriptor<TFields, true, false>
	<
		const TFields extends OutputFields,
		const TNullable extends boolean,
		const TList extends boolean,
	>(
		options: ObjectOutputOptions<TFields, TNullable, TList>,
	): ObjectOutputDescriptor<TFields, TNullable, TList>
}

/** Provides value descriptors without exposing persistence or mutation behavior. */
export interface OutputBuilder extends UltimaBaseGeneratedOutputBuilderMethods {
	/** Describes a string result. @example `output.string({ nullable: false })` */
	readonly string: OutputScalarBuilderMethod<'string', string>
	/** Describes a boolean result. @example `output.boolean()` */
	readonly boolean: OutputScalarBuilderMethod<'boolean', boolean>
	/** Describes a safe integer result. @example `output.int()` */
	readonly int: OutputScalarBuilderMethod<'int', number>
	/** Describes a floating-point result. @example `output.float()` */
	readonly float: OutputScalarBuilderMethod<'float', number>
	/** Describes an arbitrary-precision integer result. @example `output.bigint()` */
	readonly bigint: OutputScalarBuilderMethod<'bigint', bigint>
	/** Describes an exact decimal string. @example `output.decimal({ scale: 2 })` */
	readonly decimal: OutputScalarBuilderMethod<
		'decimal',
		string,
		DecimalOutputRepresentationOptions
	>
	/** Describes a UUID string. @example `output.uuid()` */
	readonly uuid: OutputScalarBuilderMethod<'uuid', string>
	/** Describes a calendar date string. @example `output.date()` */
	readonly date: OutputScalarBuilderMethod<'date', string>
	/** Describes a time string. @example `output.time({ timezone: true })` */
	readonly time: OutputScalarBuilderMethod<
		'time',
		string,
		TemporalOutputRepresentationOptions
	>
	/** Describes a date-time string. @example `output.dateTime()` */
	readonly dateTime: OutputScalarBuilderMethod<
		'dateTime',
		string,
		TemporalOutputRepresentationOptions
	>
	/** Describes immutable bytes. @example `output.binary()` */
	readonly binary: OutputScalarBuilderMethod<'binary', Uint8Array>
	/** Describes a JSON object or array. @example `output.json()` */
	readonly json: OutputScalarBuilderMethod<'json', JsonDocument>
	/** Describes one exact closed string domain. */
	readonly enum: OutputEnumBuilderMethod
	/** Describes one exact recursively structured object. */
	readonly object: OutputObjectBuilderMethod
}
