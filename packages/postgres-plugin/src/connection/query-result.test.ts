import { describe, expect, it } from 'vitest'

import { readPostgresQueryRows } from './query-result.js'

class DriverQueryResult {
	constructor(readonly rows: readonly unknown[]) {}
}

describe('PostgreSQL query result boundary', () => {
	it('accepts pg-style result instances without requiring a plain prototype', () => {
		const rows = [{ value: 1 }]

		expect(
			readPostgresQueryRows(
				new DriverQueryResult(rows),
				'PostgreSQL fixture query',
			),
		).toBe(rows)
	})

	it.each([null, {}, { rows: null }, { rows: {} }])(
		'rejects malformed driver results: %j',
		(result) => {
			expect(() =>
				readPostgresQueryRows(result, 'PostgreSQL fixture query'),
			).toThrow(
				new TypeError('PostgreSQL fixture query returned an invalid result'),
			)
		},
	)
})
