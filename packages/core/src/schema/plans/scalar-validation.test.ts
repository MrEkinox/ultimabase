import { describe, expect, it } from 'vitest'

import {
	bigintField,
	binaryField,
	dateField,
	dateTimeField,
	decimalField,
	floatField,
	intField,
	stringField,
	timeField,
	uuidField,
	type GenericField,
} from '../index.js'
import {
	fieldUsesTemporalTimezone,
	validateScalarFieldConstraints,
} from './scalar-validation.js'

const issueCodes = (field: GenericField, value: unknown): readonly string[] =>
	validateScalarFieldConstraints(field, value, ['value']).map(
		(issue) => issue.code,
	)

describe('scalar constraint validation', () => {
	it('evaluates string, binary, numeric, and exact decimal constraints', () => {
		expect(
			issueCodes(
				stringField({
					validation: { length: { min: 3, max: 4 }, match: /^a+$/u },
				}),
				'b',
			),
		).toStrictEqual(['string.length.min', 'string.match'])
		expect(
			issueCodes(stringField({ validation: { length: { max: 2 } } }), 'long'),
		).toStrictEqual(['string.length.max'])
		expect(
			issueCodes(
				binaryField({ validation: { length: { min: 2, max: 3 } } }),
				new Uint8Array([1]),
			),
		).toStrictEqual(['binary.length.min'])
		expect(
			issueCodes(
				binaryField({ validation: { length: { max: 1 } } }),
				new Uint8Array([1, 2]),
			),
		).toStrictEqual(['binary.length.max'])
		expect(
			issueCodes(intField({ validation: { range: { min: 2, max: 4 } } }), 1),
		).toStrictEqual(['int.range.min'])
		expect(
			issueCodes(intField({ validation: { range: { max: 4 } } }), 5),
		).toStrictEqual(['int.range.max'])
		expect(
			issueCodes(
				floatField({ validation: { finite: true, range: { max: 5 } } }),
				Number.POSITIVE_INFINITY,
			),
		).toStrictEqual(['float.finite', 'float.range.max'])
		expect(
			issueCodes(
				bigintField({ validation: { range: { min: 2n, max: 4n } } }),
				5n,
			),
		).toStrictEqual(['bigint.range.max'])
		expect(
			issueCodes(decimalField({ precision: 3, scale: 1 }), '12.34'),
		).toStrictEqual(['decimal.precision', 'decimal.scale'])
		expect(
			issueCodes(
				decimalField({
					precision: 3,
					scale: 1,
					validation: {
						range: { min: '1.0', max: '9.9' },
					},
				}),
				'12.34',
			),
		).toStrictEqual(['decimal.precision', 'decimal.scale', 'decimal.range.max'])
		// Presence-only validation exercises scalar kinds without optional constraints.
		expect(issueCodes(stringField({ required: true }), 'valid')).toStrictEqual(
			[],
		)
		expect(issueCodes(intField({ required: true }), 1)).toStrictEqual([])
	})

	it('uses each temporal field timezone policy for ordered ranges', () => {
		expect(
			issueCodes(
				dateField({ validation: { range: { min: '2026-01-02' } } }),
				'2026-01-01',
			),
		).toStrictEqual(['date.range.min'])
		expect(
			issueCodes(
				timeField({
					timezone: true,
					validation: { range: { max: '10:00:00.000Z' } },
				}),
				'12:00:00.000Z',
			),
		).toStrictEqual(['time.range.max'])
		expect(
			issueCodes(
				dateTimeField({
					validation: { range: { max: '2026-01-01T10:00:00.000Z' } },
				}),
				'2026-01-01T12:00:00.000Z',
			),
		).toStrictEqual(['dateTime.range.max'])
		expect(fieldUsesTemporalTimezone(dateTimeField())).toBe(true)
		expect(fieldUsesTemporalTimezone(dateTimeField({ timezone: false }))).toBe(
			false,
		)
		expect(fieldUsesTemporalTimezone(timeField())).toBe(false)
		expect(fieldUsesTemporalTimezone(timeField({ timezone: true }))).toBe(true)
	})

	it('validates canonical UUIDs and preserves immutable issue paths', () => {
		const invalid = validateScalarFieldConstraints(
			uuidField({ validation: { version: 7 } }),
			'not-a-uuid',
			['profile', 'id'],
		)
		const wrongVersion = validateScalarFieldConstraints(
			uuidField({ validation: { version: 7 } }),
			'550e8400-e29b-41d4-a716-446655440000',
			['id'],
		)

		expect(invalid).toMatchObject([
			{ code: 'uuid.type', path: ['profile', 'id'] },
		])
		expect(wrongVersion).toMatchObject([{ code: 'uuid.version' }])
		expect(Object.isFrozen(invalid)).toBe(true)
		expect(Object.isFrozen(invalid[0]?.path)).toBe(true)
		expect(
			validateScalarFieldConstraints(stringField(), 'ok', []),
		).toStrictEqual([])
	})
})
