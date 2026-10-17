import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldTypeState,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import {
	assertTemporalAutoNow,
	createTemporalNormalizer,
	readTemporalTimezone,
	type TimezoneTemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Describes a date and time with timezone support enabled by default.
 */
export type DateTimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a date-time string and exact options through schema inference.
 */
export type DateTimeField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'dateTime', string, DateTimeFieldOptions, TState>

/** Provides date-time-specific names for compact auto-now inference. */
type DefaultedDateTimeFieldOptions<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	string,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>,
	TIndexed
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, true, true>

type NonDefaultedDateTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>,
	TIndexed
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, false, true>

type ResolvedDateTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'dateTime',
	string,
	DateTimeFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedDateTimeField<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<
	DefaultedFieldNonNull<TNullable>,
	TList,
	TImmutable,
	true,
	TAutoNow
>

type NonDefaultedDateTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<TRequired, TList, TImmutable, false, TAutoNow>

export interface DateTimeFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedDateTimeFieldOptions<
				TNullable,
				TList,
				TImmutable,
				TAutoNow,
				TIndexed
			>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				string,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedDateTimeField<TNullable, TList, TImmutable, TAutoNow>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedDateTimeFieldOptions<
				TRequired,
				TList,
				TImmutable,
				TAutoNow,
				TIndexed
			>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedDateTimeField<TRequired, TList, TImmutable, TAutoNow>
	>
}

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/u
const timezoneSuffixPattern = /(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u

const hasValidLocalDateTime = (value: string): boolean => {
	const timestamp = Date.parse(`${value}Z`)

	return (
		localDateTimePattern.test(value) &&
		Number.isFinite(timestamp) &&
		new Date(timestamp).toISOString() === `${value}Z`
	)
}

/**
 * Creates the scalar normalizer shared by direct and structured date-time defaults.
 */
export const createDateTimeNormalizer = (
	timezone: boolean,
): ((value: unknown, path: string) => string) =>
	createTemporalNormalizer(
		`a complete ISO date-time string ${timezone ? 'with' : 'without'} a timezone`,
		(value) => {
			// A zoned value must carry a suffix; its local part follows the local rules.
			const localValue = timezone
				? value.replace(timezoneSuffixPattern, '')
				: value
			const timestamp = Date.parse(timezone ? value : `${value}Z`)

			return (
				(!timezone || localValue.length !== value.length) &&
				hasValidLocalDateTime(localValue) &&
				Number.isFinite(timestamp)
			)
		},
	)

/**
 * Declares a complete millisecond-precision date and time, with a timezone by default.
 *
 * @example
 * ```ts
 * dateTimeField({ autoNow: true })
 * ```
 */
export const dateTimeField: DateTimeFieldFactory = createScalarFieldFactory(
	'dateTime',
	createDateTimeNormalizer(true),
	{
		optionKeys: ['autoNow', 'timezone'],
		assertOptions: assertTemporalAutoNow,
		resolveSnapshot: (options) =>
			createDateTimeNormalizer(readTemporalTimezone(options.timezone, true)),
	},
)
