import type { FieldDefinition } from '../base/contract.js'
import {
	createConfiguredScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	createTemporalFieldConfigurationResolver,
	type TemporalRangeValidationOptions,
	type TemporalValidationOptions,
	type TemporalValueComparator,
	type TimezoneTemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Defines ordered time-of-day boundaries using the field's timezone policy.
 */
export type TimeRangeValidationOptions = TemporalRangeValidationOptions

/**
 * Groups presence and time-of-day constraints under one validation boundary.
 */
export type TimeValidationOptions = TemporalValidationOptions

/**
 * Describes a time of day without timezone support by default.
 */
export type TimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a time-of-day string and exact options through schema inference.
 */
export type TimeField<TOptions extends TimeFieldOptions = TimeFieldOptions> =
	FieldDefinition<'time', string, TOptions>

const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}$/u
const zonedTimePattern =
	/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u

/**
 * Creates the scalar normalizer shared by direct and structured time defaults.
 */
export const createTimeNormalizer = (
	timezone: boolean,
): ((value: unknown, path: string) => string) => {
	const expectation = timezone
		? 'a complete ISO time string with a timezone'
		: 'a complete ISO time string without a timezone'
	const pattern = timezone ? zonedTimePattern : localTimePattern

	return (value, path) => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be ${expectation}`)
		}

		if (!pattern.test(value)) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}
}

const readZonedTimeOffset = (value: string): number => {
	const hour = Number(value.slice(0, 2))
	const minute = Number(value.slice(3, 5))
	const second = Number(value.slice(6, 8))
	const millisecond = Number(value.slice(9, 12))
	const timezone = value.slice(12)
	const offsetHour = timezone === 'Z' ? 0 : Number(timezone.slice(1, 3))
	const offsetMinute = timezone === 'Z' ? 0 : Number(timezone.slice(4, 6))
	const offsetDirection = timezone.startsWith('-') ? -1 : 1
	const localMilliseconds =
		((hour * 60 + minute) * 60 + second) * 1_000 + millisecond
	const offsetMilliseconds =
		(offsetHour * 60 + offsetMinute) * 60_000 * offsetDirection

	// Zoned times compare as their UTC-adjusted time-of-day values.
	return localMilliseconds - offsetMilliseconds
}

const compareZonedTimes: TemporalValueComparator = (left, right) =>
	readZonedTimeOffset(left) - readZonedTimeOffset(right)

const resolveTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<TimeFieldOptions>(
		false,
		createTimeNormalizer,
		compareZonedTimes,
	)

/** Creates immutable time metadata with option-dependent timezone semantics. */
export const timeField: ScalarFieldFactory<'time', string, TimeFieldOptions> =
	createConfiguredScalarFieldFactory('time', resolveTimeFieldConfiguration)
