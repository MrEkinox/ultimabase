import { describe, expect, it } from 'vitest'

import { resolveAuthHttpOptions } from './http-options.js'

describe('authPlugin HTTP options', () => {
	it('serves Bearer under /auth by default', () => {
		expect(resolveAuthHttpOptions(undefined)).toStrictEqual({
			basePath: '/auth',
			cookie: undefined,
		})
	})

	it('normalizes the prefix and the exact secure host-only cookie', () => {
		const options = resolveAuthHttpOptions({
			basePath: '/account/auth',
			cookie: { name: '__Host-notes-session' },
		})
		expect(options).toStrictEqual({
			basePath: '/account/auth',
			cookie: { name: '__Host-notes-session', sameSite: 'lax' },
		})
		expect(Object.isFrozen(options.cookie)).toBe(true)
	})

	it('rejects weaker or ambiguous configuration', () => {
		for (const options of [
			{ cookie: { name: 'session' } },
			{ cookie: { name: '__Host-' } },
			{ cookie: { domain: 'example.test', name: '__Host-session' } },
			{ cookie: { name: '__Host-session', sameSite: 'invalid' } },
			{ basePath: 'auth' },
			{ basePath: '/Auth' },
			{ basePath: '/auth/' },
			{ prefix: '/auth' },
		]) {
			expect(
				() => resolveAuthHttpOptions(options),
				JSON.stringify(options),
			).toThrow(TypeError)
		}
	})
})
