import { describe, expect, it } from 'vitest'

import {
	isWideningPostgresTypeChange,
	normalizePostgresType,
} from './safety.js'

describe('PostgreSQL type conversions (ADR-0320)', () => {
	it.each([
		['numeric(10,2)', 'numeric(12, 2)'],
		['numeric(10,2)', 'numeric(12,4)'],
		['numeric(10)', 'numeric(10, 0)'],
		['numeric(10,2)', 'numeric'],
		['numeric', 'numeric'],
		['bigint', 'numeric'],
		['bigint', 'numeric(19)'],
		['bigint', 'numeric(21, 2)'],
		['time(3)', 'time'],
		['time(3) with time zone', 'time(6) with time zone'],
		['timestamp(3) without time zone', 'timestamp(6)'],
		['timestamp(3) with time zone', 'timestamp with time zone'],
	])('applies the widening conversion %s -> %s', (from, to) => {
		expect(isWideningPostgresTypeChange(from, to)).toBe(true)
	})

	it.each([
		['double precision', 'text'],
		['bigint', 'text'],
		['text', 'jsonb'],
		['bigint', 'double precision'],
		['double precision', 'numeric'],
		['numeric', 'numeric(12, 2)'],
		['numeric(12,2)', 'numeric(12, 1)'],
		['numeric(12,2)', 'numeric(11, 2)'],
		['bigint', 'numeric(18)'],
		['numeric(10)', 'bigint'],
		['time(6)', 'time(3)'],
		['timestamp(3)', 'timestamp(3) with time zone'],
		['date', 'timestamp(3)'],
		['uuid', 'text'],
		['boolean', 'bigint'],
	])('refuses the conversion %s -> %s', (from, to) => {
		expect(isWideningPostgresTypeChange(from, to)).toBe(false)
	})

	it('normalizes catalog and Drizzle spellings alike', () => {
		expect(normalizePostgresType('numeric(12, 4)')).toBe(
			normalizePostgresType('numeric(12,4)'),
		)
		expect(normalizePostgresType('timestamp(3) without time zone')).toBe(
			'timestamp(3)',
		)
	})
})
