import { immutableRecord } from '@ultimabase/shared'

import { assertExactOptions } from './definitions.js'

/** Limits the requests one client address may send per minute. */
export interface HttpRateLimit {
	/** Requests accepted per client address and minute. @example 60 */
	readonly perMinute: number
}

/** Limits one route or mount beyond the application-wide HTTP settings. */
export interface HttpEndpointLimits {
	/**
	 * Largest request body in bytes, replacing `httpPlugin({ bodyLimit })` for
	 * this endpoint. @example 10_485_760
	 */
	readonly bodyLimit?: number
	/**
	 * A stricter per-client limit for this endpoint, counted in addition to
	 * `httpPlugin({ rateLimit: { default } })`. @example { perMinute: 5 }
	 */
	readonly rateLimit?: HttpRateLimit
}

/** @internal Accepts one positive safe integer, the shape of every HTTP size and count. */
export const assertPositiveSafeInteger: (
	value: unknown,
	label: string,
) => asserts value is number = (value, label) => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`${label} must be a positive safe integer`)
	}
}

/** @internal Validates and snapshots one `{ perMinute }` limit. */
export const normalizeHttpRateLimit = (
	value: unknown,
	label: string,
): HttpRateLimit => {
	assertExactOptions(value, ['perMinute'], label)
	assertPositiveSafeInteger(value.perMinute, `${label} perMinute`)
	return immutableRecord({ perMinute: value.perMinute })
}

/** @internal Copies only the limits an endpoint declares, validated. */
export const normalizeHttpEndpointLimits = (
	options: Readonly<{ bodyLimit?: unknown; rateLimit?: unknown }>,
	label: string,
): HttpEndpointLimits => {
	const limits: { bodyLimit?: number; rateLimit?: HttpRateLimit } = {}
	if (options.bodyLimit !== undefined) {
		assertPositiveSafeInteger(options.bodyLimit, `${label} bodyLimit`)
		limits.bodyLimit = options.bodyLimit
	}
	if (options.rateLimit !== undefined) {
		limits.rateLimit = normalizeHttpRateLimit(
			options.rateLimit,
			`${label} rateLimit`,
		)
	}
	return limits
}
