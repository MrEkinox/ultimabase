import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

const minute = 60_000
const day = 24 * 60 * minute

/** Configures rolling and absolute session lifetimes in integer milliseconds. */
export interface PasswordSessionPolicyOptions {
	/** Selects the rolling lifetime from five minutes through thirty days. */
	readonly expiresInMs?: number
	/** Selects the absolute lifetime from one through 365 days. */
	readonly absoluteExpiresInMs?: number
}

/** Carries the complete validated session lifetime policy. */
export interface ResolvedPasswordSessionPolicy {
	readonly absoluteExpiresInMs: number
	readonly expiresInMs: number
}

/** Uses seven rolling days and a thirty-day absolute ceiling. */
export const defaultPasswordSessionPolicy: ResolvedPasswordSessionPolicy =
	immutableRecord({
		absoluteExpiresInMs: 30 * day,
		expiresInMs: 7 * day,
	})

const policyKeys = new Set(['absoluteExpiresInMs', 'expiresInMs'])

const boundedInteger = (
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
): number => {
	const resolved = value ?? fallback
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

/** Validates one application-local session lifetime policy. */
export const resolvePasswordSessionPolicy = (
	options: PasswordSessionPolicyOptions | undefined,
): ResolvedPasswordSessionPolicy => {
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError('passwordAuthPlugin session must be a plain object')
	}
	for (const key of Object.keys(options ?? {})) {
		if (!policyKeys.has(key)) {
			throw new TypeError(
				`passwordAuthPlugin session contains unknown option: ${key}`,
			)
		}
	}
	const expiresInMs = boundedInteger(
		options?.expiresInMs,
		defaultPasswordSessionPolicy.expiresInMs,
		5 * minute,
		30 * day,
		'passwordAuthPlugin session.expiresInMs',
	)
	const absoluteExpiresInMs = boundedInteger(
		options?.absoluteExpiresInMs,
		defaultPasswordSessionPolicy.absoluteExpiresInMs,
		day,
		365 * day,
		'passwordAuthPlugin session.absoluteExpiresInMs',
	)
	if (absoluteExpiresInMs < expiresInMs) {
		throw new TypeError(
			'passwordAuthPlugin session.absoluteExpiresInMs must be at least expiresInMs',
		)
	}
	return immutableRecord({ absoluteExpiresInMs, expiresInMs })
}
