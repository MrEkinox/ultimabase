import { describe, expect, it } from 'vitest'

import {
	createApplicationTimezoneFormatter,
	projectOperationTemporalValues,
} from './operation-clock.js'

describe('operation clock', () => {
	it('projects one instant through the configured application timezone', () => {
		const formatter = createApplicationTimezoneFormatter('Europe/Paris')
		const values = projectOperationTemporalValues(
			new Date('2026-07-14T10:11:12.345Z'),
			formatter,
		)

		expect(values).toStrictEqual({
			date: '2026-07-14',
			dateTime: '2026-07-14T12:11:12.345',
			dateTimeWithTimezone: '2026-07-14T12:11:12.345+02:00',
			time: '12:11:12.345',
			timeWithTimezone: '12:11:12.345+02:00',
		})
		expect(Object.isFrozen(values)).toBe(true)
	})

	it('uses the canonical Z suffix for UTC', () => {
		const values = projectOperationTemporalValues(
			new Date('2026-01-02T03:04:05.006Z'),
			createApplicationTimezoneFormatter('UTC'),
		)

		expect(values.dateTimeWithTimezone).toBe('2026-01-02T03:04:05.006Z')
		expect(values.timeWithTimezone).toBe('03:04:05.006Z')
	})

	it('rejects invalid timezones and clock values before validation begins', () => {
		expect(() => createApplicationTimezoneFormatter('Not/A_Timezone')).toThrow(
			new RangeError('Invalid application timezone: Not/A_Timezone'),
		)
		expect(() =>
			projectOperationTemporalValues(
				new Date(Number.NaN),
				createApplicationTimezoneFormatter('UTC'),
			),
		).toThrow(
			new TypeError('Runtime validation clock must return a valid Date'),
		)
	})
})
