import { assertOptionalBoolean } from '@ultimabase/shared'

import type { FieldOptions } from '../base/contract.js'
import { hasListOption } from '../base/options.js'

interface TemporalAutoNowOption {
	/**
	 * Enables operation-clock generation when `true`; it cannot be combined with `default` or `list`.
	 *
	 * @example `autoNow: true`
	 */
	readonly autoNow?: boolean
}

/** Keeps operation-clock generation distinct from developer-owned defaults. */
export interface TemporalFieldOptions
	extends FieldOptions<string>, TemporalAutoNowOption {}

/** Adds timezone policy only to time-bearing temporal fields. */
export interface TimezoneTemporalFieldOptions extends TemporalFieldOptions {
	/**
	 * Chooses whether values include a timezone offset. `timeField` defaults to `false`; `dateTimeField` defaults to `true`.
	 *
	 * @example `timezone: false`
	 */
	readonly timezone?: boolean
}

/**
 * Resolves a timezone flag while protecting factories called from untyped code.
 */
export const readTemporalTimezone = (
	timezone: unknown,
	defaultValue: boolean,
): boolean => {
	assertOptionalBoolean(timezone, 'timezone')

	return timezone ?? defaultValue
}

/** Protects JavaScript callers from ambiguous or unsupported clock generation. */
export const assertTemporalAutoNow = (options: object): void => {
	const autoNow = 'autoNow' in options ? options.autoNow : undefined

	assertOptionalBoolean(autoNow, 'autoNow')

	if (autoNow !== true) {
		return
	}

	if ('default' in options) {
		throw new TypeError('autoNow and default cannot both be configured')
	}

	if (hasListOption(options)) {
		throw new TypeError('autoNow cannot be used with list fields')
	}
}

/**
 * Builds a temporal normalizer that reports one expectation for both a wrong
 * JavaScript type and an invalid canonical representation.
 */
export const createTemporalNormalizer =
	(expectation: string, isValid: (value: string) => boolean) =>
	(value: unknown, path: string): string => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be ${expectation}`)
		}

		if (!isValid(value)) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}
