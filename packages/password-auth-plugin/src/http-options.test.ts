import { describe, expect, it } from 'vitest'

import { resolvePasswordAuthHttpOptions } from './http-options.js'

describe('Password Auth HTTP options', () => {
	it('keeps Bearer as the zero-configuration default', () => {
		expect(resolvePasswordAuthHttpOptions(undefined)).toBeUndefined()
	})

	it('normalizes the exact secure host-only cookie policy', () => {
		const options = resolvePasswordAuthHttpOptions({
			cookie: { name: '__Host-notes-session' },
		})
		expect(options).toStrictEqual({
			name: '__Host-notes-session',
			sameSite: 'lax',
		})
		expect(Object.isFrozen(options)).toBe(true)
	})

	it('rejects weaker or ambiguous cookie configuration', () => {
		for (const options of [
			{ cookie: { name: 'session' } },
			{ cookie: { name: '__Host-' } },
			{ cookie: { domain: 'example.test', name: '__Host-session' } },
			{ cookie: { name: '__Host-session', sameSite: 'invalid' } },
			{},
		]) {
			expect(() => resolvePasswordAuthHttpOptions(options as never)).toThrow(
				TypeError,
			)
		}
	})
})
