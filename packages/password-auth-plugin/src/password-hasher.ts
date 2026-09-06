import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2'
import { immutableRecord } from '@ultimabase/shared'

import { normalizePasswordInput } from './normalization.js'
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
const dummyPasswordVerifier: PasswordVerifier = immutableRecord({
	encoded:
		'$argon2id$v=19$m=65536,p=4,t=3$VWx0aW1hQmFzZUR1bW15IQ$DrGfRuKZHfoRqH5kK09Up6MQ+pVBH3zt2tVOLkBa3H4',
	policyVersion: 0,
})

const withPasswordBytes = async <TResult>(
	password: unknown,
	use: (bytes: Buffer) => Promise<TResult>,
): Promise<TResult> => {
	const normalized = normalizePasswordInput(password)
	const bytes = Buffer.from(normalized, 'utf8')
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

/** Hashes one normalized password through the configured Argon2id policy. */
export const createPasswordVerifier = (
	password: unknown,
	policy: ResolvedPasswordHashPolicy,
): Promise<PasswordVerifier> =>
	withPasswordBytes(password, async (bytes) =>
		immutableRecord({
			encoded: await hash(bytes, toArgon2Options(policy)),
			policyVersion: policy.policyVersion,
		}),
	)

/** Verifies one PHC credential and reports a monotonic policy upgrade. */
export const verifyPassword = async (
	password: unknown,
	verifier: PasswordVerifier,
	policy: ResolvedPasswordHashPolicy,
): Promise<PasswordVerification> => {
	if (!verifier.encoded.startsWith(argon2idV19Prefix)) {
		throw new TypeError('Password Auth verifier must use Argon2id version 19')
	}
	const matches = await withPasswordBytes(password, (bytes) =>
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
		matches,
		requiresUpgrade: matches && verifier.policyVersion < policy.policyVersion,
	})
}

/** Equalizes an absent credential with one real Argon2id verification attempt. */
export const verifyPasswordOrDummy = async (
	password: unknown,
	verifier: PasswordVerifier | null,
	policy: ResolvedPasswordHashPolicy,
): Promise<PasswordVerification> => {
	const result = await verifyPassword(
		password,
		verifier ?? dummyPasswordVerifier,
		policy,
	)
	return verifier === null
		? immutableRecord({ matches: false, requiresUpgrade: false })
		: result
}
