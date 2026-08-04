import { describe, expect, it } from 'vitest'

import { readPostgresDriverCode } from './driver-error.js'

describe('PostgreSQL driver error code reader', () => {
	it('reads direct and wrapped codes without inspecting unrelated values', () => {
		const driver = Object.assign(new Error('driver'), { code: '23505' })
		const wrapped = new Error('query', { cause: driver })

		expect(readPostgresDriverCode(driver)).toBe('23505')
		expect(readPostgresDriverCode(wrapped)).toBe('23505')
		expect(readPostgresDriverCode(new Error('plain'))).toBeUndefined()
		expect(readPostgresDriverCode('23505')).toBeUndefined()
	})

	it('stops safely when the cause chain contains a cycle', () => {
		const first: { cause?: unknown } = {}
		const second: { cause?: unknown } = { cause: first }

		first.cause = second

		expect(readPostgresDriverCode(first)).toBeUndefined()
	})
})
