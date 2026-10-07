import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'
import {
	defaultUndefinedOptions,
	resolveBoundedInteger,
} from './policy-options.js'

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

const parsePasswordHashPolicy: (
	options: unknown,
) => ResolvedPasswordHashPolicy = definePluginOptionsParser({
	name: 'passwordAuthPlugin password',
	keys: ['memoryCostKiB', 'parallelism', 'policyVersion', 'timeCost'] as const,
	formatUnknownKey: (key) =>
		`passwordAuthPlugin password contains unknown option: ${String(key)}`,
	normalize: ({ memoryCostKiB, parallelism, policyVersion, timeCost }) => ({
		algorithm: 'argon2id',
		hashLength: 32,
		memoryCostKiB: resolveBoundedInteger(
			memoryCostKiB,
			defaultPasswordHashPolicy.memoryCostKiB,
			19_456,
			1_048_576,
			'passwordAuthPlugin password.memoryCostKiB',
		),
		parallelism: resolveBoundedInteger(
			parallelism,
			defaultPasswordHashPolicy.parallelism,
			1,
			16,
			'passwordAuthPlugin password.parallelism',
		),
		policyVersion: resolveBoundedInteger(
			policyVersion,
			defaultPasswordHashPolicy.policyVersion,
			1,
			Number.MAX_SAFE_INTEGER,
			'passwordAuthPlugin password.policyVersion',
		),
		timeCost: resolveBoundedInteger(
			timeCost,
			defaultPasswordHashPolicy.timeCost,
			2,
			10,
			'passwordAuthPlugin password.timeCost',
		),
		version: 19,
	}),
})

/** Validates and snapshots an application password policy. */
export const resolvePasswordHashPolicy = (
	options: PasswordHashPolicyOptions | undefined,
): ResolvedPasswordHashPolicy =>
	parsePasswordHashPolicy(defaultUndefinedOptions(options))
