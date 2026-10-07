import { immutableRecord } from '@ultimabase/shared'

interface LocalDateTimeParts {
	readonly day: string
	readonly hour: string
	readonly minute: string
	readonly month: string
	readonly second: string
	readonly year: string
}

/** Carries every temporal projection derived from one operation instant. */
export interface OperationTemporalValues {
	readonly date: string
	readonly dateTime: string
	readonly dateTimeWithTimezone: string
	readonly time: string
	readonly timeWithTimezone: string
}

const readPart = (
	parts: readonly Intl.DateTimeFormatPart[],
	type: Intl.DateTimeFormatPartTypes,
): string => parts.find((part) => part.type === type)?.value ?? ''

const readLocalParts = (
	formatter: Intl.DateTimeFormat,
	instant: Date,
): LocalDateTimeParts => {
	const parts = formatter.formatToParts(instant)

	return immutableRecord({
		day: readPart(parts, 'day'),
		hour: readPart(parts, 'hour'),
		minute: readPart(parts, 'minute'),
		month: readPart(parts, 'month'),
		second: readPart(parts, 'second'),
		year: readPart(parts, 'year'),
	})
}

const formatOffset = (instant: Date, parts: LocalDateTimeParts): string => {
	const localTimestamp = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
		instant.getUTCMilliseconds(),
	)
	const offsetMinutes = Math.round(
		(localTimestamp - instant.getTime()) / 60_000,
	)

	if (offsetMinutes === 0) {
		return 'Z'
	}

	const direction = offsetMinutes < 0 ? '-' : '+'
	const absoluteMinutes = Math.abs(offsetMinutes)
	const hour = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')
	const minute = String(absoluteMinutes % 60).padStart(2, '0')

	return `${direction}${hour}:${minute}`
}

/** Validates one application timezone before the first operation begins. */
export const createApplicationTimezoneFormatter = (
	timezone: string,
): Intl.DateTimeFormat => {
	try {
		return new Intl.DateTimeFormat('en-CA', {
			calendar: 'iso8601',
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23',
			minute: '2-digit',
			month: '2-digit',
			second: '2-digit',
			timeZone: timezone,
			year: 'numeric',
		})
	} catch (error: unknown) {
		throw new RangeError(`Invalid application timezone: ${timezone}`, {
			cause: error,
		})
	}
}

/** Projects one valid instant into every portable temporal field representation. */
export const projectOperationTemporalValues = (
	instant: Date,
	formatter: Intl.DateTimeFormat,
): OperationTemporalValues => {
	if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
		throw new TypeError('Runtime validation clock must return a valid Date')
	}

	const parts = readLocalParts(formatter, instant)
	const milliseconds = String(instant.getUTCMilliseconds()).padStart(3, '0')
	const date = `${parts.year}-${parts.month}-${parts.day}`
	const time = `${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}`
	const dateTime = `${date}T${time}`
	const offset = formatOffset(instant, parts)

	return immutableRecord({
		date,
		dateTime,
		dateTimeWithTimezone: `${dateTime}${offset}`,
		time,
		timeWithTimezone: `${time}${offset}`,
	})
}
