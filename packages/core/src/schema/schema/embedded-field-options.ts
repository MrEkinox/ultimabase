import { isPlainRecord } from '@ultimabase/shared'

import type {
	CompatibleFieldOptionsExtension,
	FieldListOption,
	FieldListValue,
	ResolveFieldSourceTemplate,
} from '../fields/base/contract.js'
import type {
	CompactScalarFieldDefinition,
	CompactScalarFieldFactory,
	DefaultedCompactScalarFieldOptions,
	GeneratedCompactScalarFieldFactory,
	NonDefaultedCompactScalarFieldOptions,
} from '../fields/base/factory.js'
import type { BigintFieldOptions } from '../fields/builtins/bigint.js'
import type { BinaryFieldOptions } from '../fields/builtins/binary.js'
import type { BooleanFieldOptions } from '../fields/builtins/boolean.js'
import type { DateTimeFieldOptions } from '../fields/builtins/date-time.js'
import type { DateFieldOptions } from '../fields/builtins/date.js'
import type { DecimalFieldOptions } from '../fields/builtins/decimal.js'
import type {
	CompatibleEnumFieldOptions,
	EnumFieldOptions,
	EnumValue,
	EnumValues,
} from '../fields/builtins/enum.js'
import type { FloatFieldOptions } from '../fields/builtins/float.js'
import type { IntFieldOptions } from '../fields/builtins/int.js'
import type { JsonDocument, JsonFieldOptions } from '../fields/builtins/json.js'
import type { StringFieldOptions } from '../fields/builtins/string.js'
import type { TimeFieldOptions } from '../fields/builtins/time.js'
import type { UuidFieldOptions } from '../fields/builtins/uuid.js'
import type {
	UltimaBaseGeneratedEmbeddedFieldOptions,
	UltimaBaseGeneratedFieldOptions,
} from '../type-info.js'

type EmbeddedValueOptions<TOptions> = Omit<
	Omit<TOptions, 'indexed'>,
	keyof UltimaBaseGeneratedFieldOptions
> &
	UltimaBaseGeneratedEmbeddedFieldOptions

/** Describes string behavior available at one embedded object property. */
export type EmbeddedStringFieldOptions =
	EmbeddedValueOptions<StringFieldOptions>
/** Describes boolean behavior available at one embedded object property. */
export type EmbeddedBooleanFieldOptions =
	EmbeddedValueOptions<BooleanFieldOptions>
/** Describes floating-point behavior available at one embedded object property. */
export type EmbeddedFloatFieldOptions = EmbeddedValueOptions<FloatFieldOptions>
/** Describes decimal behavior available at one embedded object property. */
export type EmbeddedDecimalFieldOptions =
	EmbeddedValueOptions<DecimalFieldOptions>
/** Describes UUID behavior available at one embedded object property. */
export type EmbeddedUuidFieldOptions = EmbeddedValueOptions<UuidFieldOptions>
/** Describes calendar-date behavior available at one embedded object property. */
export type EmbeddedDateFieldOptions = EmbeddedValueOptions<DateFieldOptions>
/** Describes timestamp behavior available at one embedded object property. */
export type EmbeddedDateTimeFieldOptions =
	EmbeddedValueOptions<DateTimeFieldOptions>
/** Describes time-of-day behavior available at one embedded object property. */
export type EmbeddedTimeFieldOptions = EmbeddedValueOptions<TimeFieldOptions>
/** Describes binary behavior available at one embedded object property. */
export type EmbeddedBinaryFieldOptions =
	EmbeddedValueOptions<BinaryFieldOptions>
/** Describes JSON behavior available at one embedded object property. */
export type EmbeddedJsonFieldOptions = EmbeddedValueOptions<JsonFieldOptions>
/** Describes enum behavior available at one embedded object property. */
export type EmbeddedEnumFieldOptions<TValues extends EnumValues = EnumValues> =
	EmbeddedValueOptions<EnumFieldOptions<TValues>>
/** Describes integer behavior without a dedicated embedded sequence. */
export type EmbeddedIntFieldOptions = Omit<
	Omit<IntFieldOptions, 'autoIncrement' | 'indexed'>,
	keyof UltimaBaseGeneratedFieldOptions
> &
	UltimaBaseGeneratedEmbeddedFieldOptions
/** Describes bigint behavior without a dedicated embedded sequence. */
export type EmbeddedBigintFieldOptions = Omit<
	Omit<BigintFieldOptions, 'autoIncrement' | 'indexed'>,
	keyof UltimaBaseGeneratedFieldOptions
> &
	UltimaBaseGeneratedEmbeddedFieldOptions

export type EmbeddedStringFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'string',
	string,
	EmbeddedStringFieldOptions,
	TSourceTemplate
>
export type EmbeddedBooleanFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'boolean',
	boolean,
	EmbeddedBooleanFieldOptions,
	TSourceTemplate
>
export type EmbeddedFloatFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'float',
	number,
	EmbeddedFloatFieldOptions,
	TSourceTemplate
>
export type EmbeddedDecimalFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'decimal',
	string,
	EmbeddedDecimalFieldOptions,
	TSourceTemplate
>
export type EmbeddedUuidFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'uuid',
	string,
	EmbeddedUuidFieldOptions,
	TSourceTemplate
>
export type EmbeddedDateFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = GeneratedCompactScalarFieldFactory<
	'date',
	string,
	EmbeddedDateFieldOptions,
	'autoNow',
	true,
	TSourceTemplate
>
export type EmbeddedDateTimeFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = GeneratedCompactScalarFieldFactory<
	'dateTime',
	string,
	EmbeddedDateTimeFieldOptions,
	'autoNow',
	true,
	TSourceTemplate
>
export type EmbeddedTimeFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = GeneratedCompactScalarFieldFactory<
	'time',
	string,
	EmbeddedTimeFieldOptions,
	'autoNow',
	true,
	TSourceTemplate
>
export type EmbeddedBinaryFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'binary',
	Uint8Array,
	EmbeddedBinaryFieldOptions,
	TSourceTemplate
>
export type EmbeddedJsonFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'json',
	JsonDocument,
	EmbeddedJsonFieldOptions,
	TSourceTemplate
>
export type EmbeddedIntFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'int',
	number,
	EmbeddedIntFieldOptions,
	TSourceTemplate
>
export type EmbeddedBigintFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = CompactScalarFieldFactory<
	'bigint',
	bigint,
	EmbeddedBigintFieldOptions,
	TSourceTemplate
>

type DefaultedEmbeddedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	EmbeddedEnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type NonDefaultedEmbeddedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	EmbeddedEnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

/** Preserves an embedded enum's exact domain while excluding root metadata. */
export interface EmbeddedEnumFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TValues extends EnumValues,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedEmbeddedEnumFieldOptions<TValues, TRequired, TList, TImmutable>,
			TExtensionOptions,
			EnumValue<TValues>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<EnumValue<TValues>, TList>,
					TRequired extends true
						? FieldListValue<EnumValue<TValues>, TList>
						: FieldListValue<EnumValue<TValues>, TList> | null
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		'enum',
		EnumValue<TValues>,
		EmbeddedEnumFieldOptions<TValues>,
		TRequired,
		TList,
		TImmutable,
		true
	>
	<
		const TValues extends EnumValues,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			NonDefaultedEmbeddedEnumFieldOptions<
				TValues,
				TRequired,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			EnumValue<TValues>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<EnumValue<TValues>, TList>,
					TRequired extends true
						? FieldListValue<EnumValue<TValues>, TList>
						: FieldListValue<EnumValue<TValues>, TList> | null
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		'enum',
		EnumValue<TValues>,
		EmbeddedEnumFieldOptions<TValues>,
		TRequired,
		TList,
		TImmutable,
		false
	>
}

/** Rejects Core options that cannot execute for one embedded occurrence. */
export const assertEmbeddedBuiltInFieldOptions = (
	methodName: string,
	options: unknown,
	path: string,
): void => {
	if (!isPlainRecord(options)) return

	if (Object.hasOwn(options, 'indexed')) {
		throw new TypeError(`${path} cannot use indexed inside objectField`)
	}

	if (
		(methodName === 'int' || methodName === 'bigint') &&
		Object.hasOwn(options, 'autoIncrement')
	) {
		throw new TypeError(`${path} cannot use autoIncrement inside objectField`)
	}

	if (Object.hasOwn(options, 'generatedOn')) {
		throw new TypeError(`${path} cannot use generatedOn inside objectField`)
	}
}
