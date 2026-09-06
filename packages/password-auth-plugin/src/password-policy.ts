import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Configures the versioned Argon2id password policy. */
export interface PasswordHashPolicyOptions {
	/** Advances monotonically whenever one hashing parameter changes. */
	readonly policyVersion?: number
	/** Selects Argon2 memory in KiB from 19,456 through 1,048,576. */
	readonly memoryCostKiB?: number
	/** Selects two through ten Argon2 passes. */
	readonly timeCost?: number
	/** Selects one through sixteen Argon2 lanes. */
	readonly parallelism?: number
}

/** Describes the complete immutable policy used for hashing and upgrade checks. */
export interface ResolvedPasswordHashPolicy {
	readonly algorithm: 'argon2id'
	readonly hashLength: 32
	readonly memoryCostKiB: number
	readonly parallelism: number
	readonly policyVersion: number
	readonly timeCost: number
	readonly version: 19
}

/** Implements RFC 9106's memory-constrained recommended Argon2id profile. */
export const defaultPasswordHashPolicy: ResolvedPasswordHashPolicy =
	immutableRecord({
		algorithm: 'argon2id',
		hashLength: 32,
		memoryCostKiB: 65_536,
		parallelism: 4,
		policyVersion: 1,
		timeCost: 3,
		version: 19,
	})

const policyOptionNames = new Set([
	'memoryCostKiB',
	'parallelism',
	'policyVersion',
	'timeCost',
])

const readBoundedInteger = (
	value: unknown,
	defaultValue: number,
	minimum: number,
	maximum: number,
	path: string,
): number => {
	const resolved = value ?? defaultValue
	if (
		typeof resolved !== 'number' ||
		!Number.isSafeInteger(resolved) ||
		resolved < minimum ||
		resolved > maximum
	) {
		throw new TypeError(
			`${path} must be a safe integer from ${String(minimum)} through ${String(maximum)}`,
		)
	}
	return resolved
}

/** Validates and snapshots an application password policy. */
export const resolvePasswordHashPolicy = (
	options: PasswordHashPolicyOptions | undefined,
): ResolvedPasswordHashPolicy => {
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError('passwordAuthPlugin password must be a plain object')
	}
	for (const key of Object.keys(options ?? {})) {
		if (!policyOptionNames.has(key)) {
			throw new TypeError(
				`passwordAuthPlugin password contains unknown option: ${key}`,
			)
		}
	}

	return immutableRecord({
		algorithm: 'argon2id',
		hashLength: 32,
		memoryCostKiB: readBoundedInteger(
			options?.memoryCostKiB,
			defaultPasswordHashPolicy.memoryCostKiB,
			19_456,
			1_048_576,
			'passwordAuthPlugin password.memoryCostKiB',
		),
		parallelism: readBoundedInteger(
			options?.parallelism,
			defaultPasswordHashPolicy.parallelism,
			1,
			16,
			'passwordAuthPlugin password.parallelism',
		),
		policyVersion: readBoundedInteger(
			options?.policyVersion,
			defaultPasswordHashPolicy.policyVersion,
			1,
			Number.MAX_SAFE_INTEGER,
			'passwordAuthPlugin password.policyVersion',
		),
		timeCost: readBoundedInteger(
			options?.timeCost,
			defaultPasswordHashPolicy.timeCost,
			2,
			10,
			'passwordAuthPlugin password.timeCost',
		),
		version: 19,
	})
}
