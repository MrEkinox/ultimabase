import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2'
import { immutableRecord } from '@ultimabase/shared'

import type { ResolvedPasswordHashPolicy } from './password-policy.js'

/** Retains only the encoded verifier and its monotonic policy identity. */
export interface PasswordVerifier {
	readonly encoded: string
	readonly policyVersion: number
}

/** Reports password verification without retaining the submitted credential. */
export interface PasswordVerification {
	readonly matches: boolean
	readonly requiresUpgrade: boolean
}

const argon2idV19Prefix = '$argon2id$v=19$'
// Unknown identities verify against this fixed valid verifier so that their
// response time matches a wrong password for an existing identity.
const dummyPasswordVerifier: PasswordVerifier = immutableRecord({
	encoded:
		'$argon2id$v=19$m=65536,p=4,t=3$VWx0aW1hQmFzZUR1bW15IQ$DrGfRuKZHfoRqH5kK09Up6MQ+pVBH3zt2tVOLkBa3H4',
	policyVersion: 0,
})

/** Passes the password to Argon2 as bytes that are overwritten afterwards. */
const withNormalizedPasswordBytes = async <TResult>(
	password: string,
	use: (bytes: Buffer) => Promise<TResult>,
): Promise<TResult> => {
	const bytes = Buffer.from(password, 'utf8')
	try {
		return await use(bytes)
	} finally {
		bytes.fill(0)
	}
}

const toArgon2Options = (policy: ResolvedPasswordHashPolicy): HashOptions => ({
	hashLength: policy.hashLength,
	memoryCost: policy.memoryCostKiB,
	parallelism: policy.parallelism,
	timeCost: policy.timeCost,
	type: argon2id,
	version: policy.version,
})

/** Fails at plugin configuration if the reviewed native hashing engine is unavailable. */
export const assertPasswordHashEngineAvailable = (): void => {
	if (
		typeof hash !== 'function' ||
		typeof verify !== 'function' ||
		typeof needsRehash !== 'function'
	) {
		throw new TypeError('Password Auth Argon2id engine is unavailable')
	}
}

/** Hashes a password already normalized by the operation boundary. */
export const createNormalizedPasswordVerifier = (
	password: string,
	policy: ResolvedPasswordHashPolicy,
): Promise<PasswordVerifier> =>
	withNormalizedPasswordBytes(password, async (bytes) =>
		immutableRecord({
			encoded: await hash(bytes, toArgon2Options(policy)),
			policyVersion: policy.policyVersion,
		}),
	)

/**
 * Verifies an operation-normalized password. A `null` verifier still runs the
 * full dummy verification, then always reports a mismatch.
 */
export const verifyNormalizedPasswordOrDummy = async (
	password: string,
	stored: PasswordVerifier | null,
	policy: ResolvedPasswordHashPolicy,
): Promise<PasswordVerification> => {
	const verifier = stored ?? dummyPasswordVerifier
	if (!verifier.encoded.startsWith(argon2idV19Prefix)) {
		throw new TypeError('Password Auth verifier must use Argon2id version 19')
	}
	const matches = await withNormalizedPasswordBytes(password, (bytes) =>
		verify(verifier.encoded, bytes),
	)
	const parametersChanged = needsRehash(
		verifier.encoded,
		toArgon2Options(policy),
	)
	if (
		matches &&
		verifier.policyVersion === policy.policyVersion &&
		parametersChanged
	) {
		throw new TypeError(
			'Password Auth hash parameter changes require a higher policyVersion',
		)
	}
	return immutableRecord({
		matches: stored !== null && matches,
		requiresUpgrade:
			stored !== null &&
			matches &&
			verifier.policyVersion < policy.policyVersion,
	})
}
