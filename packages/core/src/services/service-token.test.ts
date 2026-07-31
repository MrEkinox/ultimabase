import { describe, expect, it } from 'vitest'

import { createServiceToken } from '../index.js'

interface DatabaseService {
	readonly dialect: 'postgres'
}

describe('createServiceToken', () => {
	it('creates immutable tokens with diagnostic names', () => {
		const token = createServiceToken<DatabaseService>('ultimabase.database')

		expect(token.debugName).toBe('ultimabase.database')
		expect(Object.isFrozen(token)).toBe(true)
		expect(Object.keys(token)).toStrictEqual(['debugName'])
	})

	it('uses token objects rather than debug names as identity', () => {
		const first = createServiceToken<DatabaseService>('ultimabase.database')
		const second = createServiceToken<DatabaseService>('ultimabase.database')
		const services = new Map<object, DatabaseService>([
			[first, { dialect: 'postgres' }],
		])

		expect(first).not.toBe(second)
		expect(services.get(first)).toStrictEqual({ dialect: 'postgres' })
		expect(services.get(second)).toBeUndefined()
	})

	it('protects JavaScript callers from invalid debug names', () => {
		expect(() => createServiceToken<DatabaseService>('')).toThrow(
			new TypeError('debugName must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects untyped token names.
			createServiceToken<DatabaseService>(42)
		}).toThrow(new TypeError('debugName must be a non-empty string'))
	})
})
