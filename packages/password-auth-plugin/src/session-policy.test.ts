import { describe, expect, it } from 'vitest'

import {
	defaultPasswordSessionPolicy,
	resolvePasswordSessionPolicy,
} from './session-policy.js'

describe('Password Auth session policy', () => {
	it('uses the reviewed seven-day and thirty-day defaults', () => {
		expect(resolvePasswordSessionPolicy(undefined)).toStrictEqual(
			defaultPasswordSessionPolicy,
		)
		expect(Object.isFrozen(defaultPasswordSessionPolicy)).toBe(true)
	})

	it('accepts bounded lifetimes with an absolute ceiling after rolling expiry', () => {
		expect(
			resolvePasswordSessionPolicy({
				absoluteExpiresInMs: 86_400_000,
				expiresInMs: 300_000,
			}),
		).toStrictEqual({
			absoluteExpiresInMs: 86_400_000,
			expiresInMs: 300_000,
		})
		expect(() =>
			resolvePasswordSessionPolicy({ expiresInMs: 299_999 }),
		).toThrow('from 300000')
		expect(() =>
			resolvePasswordSessionPolicy({
				absoluteExpiresInMs: 86_400_000,
				expiresInMs: 86_400_001,
			}),
		).toThrow('must be at least expiresInMs')
		expect(() =>
			resolvePasswordSessionPolicy({ unknown: true } as never),
		).toThrow('unknown option')
	})
})
