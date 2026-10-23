// `DateTime` and `JSON` (D-107), as values and as literals.
import { parseConstValue } from 'graphql'
import { describe, expect, it } from 'vitest'
import { DateTime, JSONScalar } from './scalars.ts'

const message =
	'A DateTime is an ISO 8601 string, such as 2026-01-31T12:00:00.000Z.'

describe('DateTime', () => {
	it('reads an ISO 8601 string, as a value or a literal', () => {
		const date = new Date('2026-01-31T12:00:00.000Z')
		expect(DateTime.coerceInputValue('2026-01-31T12:00:00.000Z')).toStrictEqual(
			date,
		)
		expect(
			DateTime.coerceInputLiteral?.(
				parseConstValue('"2026-01-31T13:00+01:00"'),
			),
		).toStrictEqual(date)
	})

	it('refuses anything else', () => {
		for (const value of ['2026-01-31', '2026-02-31T25:00Z', 5]) {
			expect(() => DateTime.coerceInputValue(value)).toThrow(message)
		}
		expect(() => DateTime.coerceInputLiteral?.(parseConstValue('5'))).toThrow(
			message,
		)
	})

	it('writes a date, and only a date', () => {
		const date = new Date('2026-01-31T12:00:00.000Z')
		expect(DateTime.coerceOutputValue(date)).toBe('2026-01-31T12:00:00.000Z')
		expect(() => DateTime.coerceOutputValue(5)).toThrow(
			'A DateTime field returned no date.',
		)
	})

	it("writes a function's ISO string in UTC (D-109)", () => {
		expect(DateTime.coerceOutputValue('2026-01-31T14:00:00+02:00')).toBe(
			'2026-01-31T12:00:00.000Z',
		)
		expect(() => DateTime.coerceOutputValue('2026-01-31')).toThrow(
			'A DateTime is an ISO 8601 string',
		)
	})
})

describe('JSON', () => {
	it('reads a literal as plain JSON', () => {
		const literal = parseConstValue(
			'{ a: [1, 2.5, "x", true, null, draft], b: { c: -3 } }',
		)
		expect(JSONScalar.coerceInputLiteral?.(literal)).toStrictEqual({
			a: [1, 2.5, 'x', true, null, 'draft'],
			b: { c: -3 },
		})
	})

	it('passes values through', () => {
		expect(JSONScalar.coerceInputValue({ a: 1 })).toStrictEqual({ a: 1 })
		expect(JSONScalar.coerceOutputValue([1])).toStrictEqual([1])
	})
})
