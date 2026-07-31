import type { FieldDefinition } from '../base/contract.js'
import {
	createConfiguredScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	createTemporalFieldConfigurationResolver,
	type TemporalFieldOptions,
	type TemporalRangeValidationOptions,
	type TemporalValidationOptions,
	type TemporalValueComparator,
} from '../constraints/temporal.js'

/**
 * Defines ordered date-time boundaries using the field's timezone policy.
 */
export type DateTimeRangeValidationOptions = TemporalRangeValidationOptions

/**
 * Groups presence and date-time constraints under one validation boundary.
 */
export type DateTimeValidationOptions = TemporalValidationOptions

/**
 * Describes a date and time with timezone support enabled by default.
 */
export type DateTimeFieldOptions = TemporalFieldOptions

/**
 * Carries a date-time string and exact options through schema inference.
 */
export type DateTimeField<
	TOptions extends DateTimeFieldOptions = DateTimeFieldOptions,
> = FieldDefinition<'dateTime', string, TOptions>

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
): ((value: unknown, path: string) => string) => {
	const expectation = timezone
		? 'a complete ISO date-time string with a timezone'
		: 'a complete ISO date-time string without a timezone'

	return (value, path) => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be ${expectation}`)
		}

		if (path === 'default' && value === 'now') {
			return value
		}

		const localValue = timezone
			? value.replace(timezoneSuffixPattern, '')
			: value
		const validTimezone = !timezone || localValue.length !== value.length
		const timestamp = timezone ? Date.parse(value) : Date.parse(`${value}Z`)

		if (
			!validTimezone ||
			!hasValidLocalDateTime(localValue) ||
			!Number.isFinite(timestamp)
		) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}
}

const compareZonedDateTimes: TemporalValueComparator = (left, right) =>
	Date.parse(left) - Date.parse(right)

const resolveDateTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<DateTimeFieldOptions>(
		true,
		createDateTimeNormalizer,
		compareZonedDateTimes,
	)

/** Creates immutable date-time metadata with option-dependent timezone semantics. */
export const dateTimeField: ScalarFieldFactory<
	'dateTime',
	string,
	DateTimeFieldOptions
> = createConfiguredScalarFieldFactory(
	'dateTime',
	resolveDateTimeFieldConfiguration,
)
