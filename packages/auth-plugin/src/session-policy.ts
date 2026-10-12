import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import {
	defaultUndefinedOptions,
	resolveBoundedInteger,
} from './policy-options.js'

const minute = 60_000
const day = 24 * 60 * minute

/** Configures session lifetimes, revocation and recent authentication. */
export interface AuthSessionOptions {
	/** Rolling lifetime, from five minutes through thirty days. @default 7 days */
	readonly expiresInMs?: number
	/** Absolute lifetime, from one through 365 days. @default 30 days */
	readonly absoluteExpiresInMs?: number
	/**
	 * Revokes every other session of the user when a password changes.
	 * @default true
	 */
	readonly revokeOnPasswordChange?: boolean
	/**
	 * How long after a login (or `reauthenticate`) sensitive operations such
	 * as `deleteAccount` stay allowed, from one through sixty minutes.
	 * @default 5 minutes
	 */
	readonly recentAuthenticationMs?: number
}

/** Carries the complete validated session policy. */
export interface ResolvedAuthSessionPolicy {
	readonly absoluteExpiresInMs: number
	readonly expiresInMs: number
	readonly recentAuthenticationMs: number
	readonly revokeOnPasswordChange: boolean
}

/** Seven rolling days, a thirty-day ceiling and five minutes of recent authentication. */
export const defaultAuthSessionPolicy: ResolvedAuthSessionPolicy =
	immutableRecord({
		absoluteExpiresInMs: 30 * day,
		expiresInMs: 7 * day,
		recentAuthenticationMs: 5 * minute,
		revokeOnPasswordChange: true,
	})

const parseSessionPolicy: (options: unknown) => ResolvedAuthSessionPolicy =
	definePluginOptionsParser({
		name: 'authPlugin session',
		keys: [
			'absoluteExpiresInMs',
			'expiresInMs',
			'recentAuthenticationMs',
			'revokeOnPasswordChange',
		] as const,
		formatUnknownKey: (key) =>
			`authPlugin session contains unknown option: ${String(key)}`,
		normalize: (options) => {
			const expiresInMs = resolveBoundedInteger(
				options.expiresInMs,
				defaultAuthSessionPolicy.expiresInMs,
				5 * minute,
				30 * day,
				'authPlugin session.expiresInMs',
			)
			const absoluteExpiresInMs = resolveBoundedInteger(
				options.absoluteExpiresInMs,
				defaultAuthSessionPolicy.absoluteExpiresInMs,
				day,
				365 * day,
				'authPlugin session.absoluteExpiresInMs',
			)
			if (absoluteExpiresInMs < expiresInMs) {
				throw new TypeError(
					'authPlugin session.absoluteExpiresInMs must be at least expiresInMs',
				)
			}
			const revoke = options.revokeOnPasswordChange ?? true
			if (typeof revoke !== 'boolean') {
				throw new TypeError(
					'authPlugin session.revokeOnPasswordChange must be a boolean',
				)
			}
			return {
				absoluteExpiresInMs,
				expiresInMs,
				recentAuthenticationMs: resolveBoundedInteger(
					options.recentAuthenticationMs,
					defaultAuthSessionPolicy.recentAuthenticationMs,
					minute,
					60 * minute,
					'authPlugin session.recentAuthenticationMs',
				),
				revokeOnPasswordChange: revoke,
			}
		},
	})

/** Validates one application-local session policy. */
export const resolveAuthSessionPolicy = (
	options: AuthSessionOptions | undefined,
): ResolvedAuthSessionPolicy =>
	parseSessionPolicy(defaultUndefinedOptions(options))
