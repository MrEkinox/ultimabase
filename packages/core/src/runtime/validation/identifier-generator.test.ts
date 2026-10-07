import { validate as validateUuid, version as readUuidVersion } from 'uuid'
import { describe, expect, it } from 'vitest'

import { generateUuidV7 } from './identifier-generator.js'

const readUuidV7Timestamp = (value: string): number =>
	Number.parseInt(value.replaceAll('-', '').slice(0, 12), 16)

describe('UUID v7 generation', () => {
	it('generates RFC UUID v7 values carrying the requested timestamp', () => {
		const timestamp = Date.parse('2026-08-01T00:00:00.000Z')
		const value = generateUuidV7(timestamp)

		expect(validateUuid(value)).toBe(true)
		expect(readUuidVersion(value)).toBe(7)
		expect(readUuidV7Timestamp(value)).toBe(timestamp)
	})

	it('orders distinct milliseconds without claiming order inside one millisecond', () => {
		const earlier = generateUuidV7(1_800_000_000_000)
		const later = generateUuidV7(1_800_000_000_001)

		expect(earlier < later).toBe(true)
	})

	it('retains collision resistance for a fixed millisecond', () => {
		const values = Array.from({ length: 1_000 }, () =>
			generateUuidV7(1_800_000_000_000),
		)

		expect(new Set(values)).toHaveLength(values.length)
	})
})
