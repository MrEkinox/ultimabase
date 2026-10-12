import { describe, expect, it } from 'vitest'

import {
	defaultAuthSessionPolicy,
	resolveAuthSessionPolicy,
} from './session-policy.js'

describe('authPlugin session policy', () => {
	it('uses seven rolling days, thirty absolute days, revocation on password change and five minutes of recent login', () => {
		expect(resolveAuthSessionPolicy(undefined)).toStrictEqual({
			absoluteExpiresInMs: 2_592_000_000,
			expiresInMs: 604_800_000,
			recentAuthenticationMs: 300_000,
			revokeOnPasswordChange: true,
		})
		expect(Object.isFrozen(defaultAuthSessionPolicy)).toBe(true)
	})

	it('accepts bounded values and rejects the others', () => {
		expect(
			resolveAuthSessionPolicy({
				absoluteExpiresInMs: 86_400_000,
				expiresInMs: 300_000,
				recentAuthenticationMs: 60_000,
				revokeOnPasswordChange: false,
			}),
		).toStrictEqual({
			absoluteExpiresInMs: 86_400_000,
			expiresInMs: 300_000,
			recentAuthenticationMs: 60_000,
			revokeOnPasswordChange: false,
		})
		expect(() => resolveAuthSessionPolicy({ expiresInMs: 299_999 })).toThrow(
			'from 300000',
		)
		expect(() =>
			resolveAuthSessionPolicy({
				absoluteExpiresInMs: 86_400_000,
				expiresInMs: 86_400_001,
			}),
		).toThrow('must be at least expiresInMs')
		expect(() =>
			resolveAuthSessionPolicy({ recentAuthenticationMs: 3_600_001 }),
		).toThrow('recentAuthenticationMs')
		expect(() =>
			resolveAuthSessionPolicy({ revokeOnPasswordChange: 'yes' } as never),
		).toThrow('must be a boolean')
		expect(() => resolveAuthSessionPolicy({ unknown: true } as never)).toThrow(
			'unknown option',
		)
	})
})
