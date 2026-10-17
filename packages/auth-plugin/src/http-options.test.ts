import { describe, expect, it } from 'vitest'

import { resolveAuthHttpOptions } from './http-options.js'

describe('authPlugin HTTP options', () => {
	it('serves Bearer under /api/auth by default', () => {
		expect(resolveAuthHttpOptions(undefined)).toStrictEqual({
			basePath: '/api/auth',
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

	it('keeps Bearer only when the options name no cookie', () => {
		expect(resolveAuthHttpOptions({ basePath: '/v2/auth' })).toStrictEqual({
			basePath: '/v2/auth',
			cookie: undefined,
		})
		expect(() => resolveAuthHttpOptions('/api/auth')).toThrow(
			'authPlugin http must be a plain object',
		)
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
			{ cookie: '__Host-session' },
		]) {
			expect(
				() => resolveAuthHttpOptions(options),
				JSON.stringify(options),
			).toThrow(TypeError)
		}
	})
})
