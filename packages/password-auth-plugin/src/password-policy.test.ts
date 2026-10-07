import { describe, expect, it } from 'vitest'

import {
	defaultPasswordHashPolicy,
	resolvePasswordHashPolicy,
} from './password-policy.js'

describe('Password Auth hash policy', () => {
	it('uses the accepted RFC 9106 memory-constrained defaults', () => {
		expect(resolvePasswordHashPolicy(undefined)).toStrictEqual({
			algorithm: 'argon2id',
			hashLength: 32,
			memoryCostKiB: 65_536,
			parallelism: 4,
			policyVersion: 1,
			timeCost: 3,
			version: 19,
		})
		expect(Object.isFrozen(defaultPasswordHashPolicy)).toBe(true)
	})

	it('accepts only bounded safe integer overrides', () => {
		expect(
			resolvePasswordHashPolicy({
				memoryCostKiB: 19_456,
				parallelism: 1,
				policyVersion: 2,
				timeCost: 2,
			}),
		).toMatchObject({
			memoryCostKiB: 19_456,
			parallelism: 1,
			policyVersion: 2,
			timeCost: 2,
		})
	})

	it.each([
		[{ memoryCostKiB: 19_455 }, 'memoryCostKiB'],
		[{ memoryCostKiB: 1_048_577 }, 'memoryCostKiB'],
		[{ timeCost: 1 }, 'timeCost'],
		[{ timeCost: 11 }, 'timeCost'],
		[{ parallelism: 0 }, 'parallelism'],
		[{ parallelism: 17 }, 'parallelism'],
		[{ policyVersion: 0 }, 'policyVersion'],
		[{ policyVersion: 1.5 }, 'policyVersion'],
	] as const)('rejects an invalid policy %o', (options, field) => {
		expect(() => resolvePasswordHashPolicy(options)).toThrow(field)
	})

	it('rejects unknown or non-object policy input', () => {
		expect(() =>
			resolvePasswordHashPolicy({ algorithm: 'scrypt' } as never),
		).toThrow('unknown option: algorithm')
		expect(() => resolvePasswordHashPolicy([] as never)).toThrow('plain object')
	})
})
