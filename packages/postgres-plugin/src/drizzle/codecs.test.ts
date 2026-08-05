import { nodePgCodecs } from 'drizzle-orm/node-postgres'
import { describe, expect, it } from 'vitest'

import { postgresDrizzleCodecs } from './codecs.js'

const normalizeWith = (
	type: keyof typeof postgresDrizzleCodecs,
	value: unknown,
) => {
	const normalize = postgresDrizzleCodecs[type]?.normalize

	if (normalize === undefined) {
		throw new TypeError(`Expected a PostgreSQL Drizzle codec: ${type}`)
	}

	const normalized: unknown = normalize(value)

	return normalized
}

describe('PostgreSQL Drizzle codecs', () => {
	it('retains native node-postgres codecs outside temporal string mapping', () => {
		expect(postgresDrizzleCodecs.jsonb).toBe(nodePgCodecs.jsonb)
	})

	it('normalizes native temporal values at the driver boundary', () => {
		expect(normalizeWith('time', '08:30:00')).toBe('08:30:00.000')
		expect(normalizeWith('timestamp:string', '2026-08-01 10:15:30.123')).toBe(
			'2026-08-01T10:15:30.123',
		)
		expect(
			normalizeWith('timestamptz:string', '2026-08-01 10:15:30.123+00'),
		).toBe('2026-08-01T10:15:30.123Z')
	})
})
