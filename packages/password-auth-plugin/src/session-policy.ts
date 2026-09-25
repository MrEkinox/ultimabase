import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'
import {
	defaultUndefinedOptions,
	resolveBoundedInteger,
} from './policy-options.js'

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

const parsePasswordSessionPolicy: (
	options: unknown,
) => ResolvedPasswordSessionPolicy = definePluginOptionsParser({
	name: 'passwordAuthPlugin session',
	keys: ['absoluteExpiresInMs', 'expiresInMs'] as const,
	formatUnknownKey: (key) =>
		`passwordAuthPlugin session contains unknown option: ${String(key)}`,
	normalize: (options) => {
		const expiresInMs = resolveBoundedInteger(
			options.expiresInMs,
			defaultPasswordSessionPolicy.expiresInMs,
			5 * minute,
			30 * day,
			'passwordAuthPlugin session.expiresInMs',
		)
		const absoluteExpiresInMs = resolveBoundedInteger(
			options.absoluteExpiresInMs,
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
		return { absoluteExpiresInMs, expiresInMs }
	},
})

/** Validates one application-local session lifetime policy. */
export const resolvePasswordSessionPolicy = (
	options: PasswordSessionPolicyOptions | undefined,
): ResolvedPasswordSessionPolicy =>
	parsePasswordSessionPolicy(defaultUndefinedOptions(options))
