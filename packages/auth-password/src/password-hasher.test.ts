import { describe, expect, it } from 'vitest'

import {
	createNormalizedPasswordVerifier,
	verifyNormalizedPasswordOrDummy,
} from './password-hasher.js'
import { resolvePasswordHashPolicy } from './password-policy.js'

const fastPolicy = resolvePasswordHashPolicy({
	memoryCostKiB: 19_456,
	parallelism: 1,
	policyVersion: 1,
	timeCost: 2,
})
const password = 'correct horse battery staple'

describe('password() Argon2id verifier', () => {
	it('creates independent PHC verifiers with library-generated salts', async () => {
		const first = await createNormalizedPasswordVerifier(password, fastPolicy)
		const second = await createNormalizedPasswordVerifier(password, fastPolicy)

		expect(first.encoded).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/u)
		expect(second.encoded).not.toBe(first.encoded)
		const encodedSalt = first.encoded.split('$')[4]
		expect(Buffer.from(encodedSalt ?? '', 'base64')).toHaveLength(16)
		expect(first.policyVersion).toBe(1)
		expect(
			await verifyNormalizedPasswordOrDummy(password, first, fastPolicy),
		).toStrictEqual({
			matches: true,
			requiresUpgrade: false,
		})
		expect(
			await verifyNormalizedPasswordOrDummy(
				'wrong password value',
				first,
				fastPolicy,
			),
		).toStrictEqual({ matches: false, requiresUpgrade: false })
	})

	it('requests upgrades only after successful verification by a newer policy', async () => {
		const verifier = await createNormalizedPasswordVerifier(
			password,
			fastPolicy,
		)
		const nextPolicy = resolvePasswordHashPolicy({
			memoryCostKiB: 19_457,
			parallelism: 1,
			policyVersion: 2,
			timeCost: 2,
		})

		expect(
			await verifyNormalizedPasswordOrDummy(password, verifier, nextPolicy),
		).toStrictEqual({
			matches: true,
			requiresUpgrade: true,
		})
		expect(
			await verifyNormalizedPasswordOrDummy(
				password,
				{ ...verifier, policyVersion: 3 },
				nextPolicy,
			),
		).toStrictEqual({ matches: true, requiresUpgrade: false })
	})

	it('requires a policy version increase when hashing parameters change', async () => {
		const verifier = await createNormalizedPasswordVerifier(
			password,
			fastPolicy,
		)
		const changedPolicy = resolvePasswordHashPolicy({
			memoryCostKiB: 19_457,
			parallelism: 1,
			policyVersion: 1,
			timeCost: 2,
		})

		await expect(
			verifyNormalizedPasswordOrDummy(password, verifier, changedPolicy),
		).rejects.toThrow('require a higher policyVersion')
	})

	it('rejects verifier algorithms outside the accepted protocol', async () => {
		await expect(
			verifyNormalizedPasswordOrDummy(
				password,
				{ encoded: '$argon2i$v=19$invalid', policyVersion: 1 },
				fastPolicy,
			),
		).rejects.toThrow('Argon2id version 19')
	})

	it('runs a fixed valid verifier while keeping absent identities rejected', async () => {
		expect(
			await verifyNormalizedPasswordOrDummy(
				'ultimabase dummy password verifier',
				null,
				fastPolicy,
			),
		).toStrictEqual({ matches: false, requiresUpgrade: false })
	})
})
