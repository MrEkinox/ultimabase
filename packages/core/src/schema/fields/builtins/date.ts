import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypeState,
	FieldListOption,
	ResolvedFieldSourceOptions,
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
	type TemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Describes a calendar day using its canonical ISO date representation.
 */
export type DateFieldOptions = TemporalFieldOptions

/**
 * Carries a calendar-day string and exact options through schema inference.
 */
export type DateField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'date', string, DateFieldOptions, TState>

/** Provides date-specific names for compact auto-now inference. */
type DefaultedDateFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DateFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, true, true>

type NonDefaultedDateFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DateFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, false, true>

type ResolvedDateField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'date',
	string,
	DateFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedDateField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateField<TRequired, TList, TImmutable, true, TAutoNow>

type NonDefaultedDateField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateField<TRequired, TList, TImmutable, false, TAutoNow>

export interface DateFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedDateFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedDateField<TRequired, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedDateFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): NonDefaultedDateField<TRequired, TList, TImmutable, TAutoNow>
}

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/u

/**
 * Normalizes canonical date defaults and boundaries for direct and structured fields.
 */
export const normalizeCalendarDate = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a calendar date string`)
	}

	const timestamp = Date.parse(`${value}T00:00:00.000Z`)
	if (
		!calendarDatePattern.test(value) ||
		!Number.isFinite(timestamp) ||
		new Date(timestamp).toISOString().slice(0, 10) !== value
	) {
		throw new RangeError(`${path} must be a valid calendar date string`)
	}

	return value
}

/**
 * Declares a calendar day in canonical `YYYY-MM-DD` form without a time of day.
 *
 * @example
 * ```ts
 * dateField({ default: "2026-08-01" })
 * ```
 */
export const dateField: DateFieldFactory = createScalarFieldFactory(
	'date',
	normalizeCalendarDate,
	{
		optionKeys: ['autoNow'],
		assertOptions: assertTemporalAutoNow,
	},
)
