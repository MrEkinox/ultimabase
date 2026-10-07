import { assertOptionalBoolean } from '@ultimabase/shared'

import type { FieldOptions } from '../base/contract.js'
import type { ScalarFieldConfigurationResolver } from '../base/factory.js'
import {
	assertFieldOptions,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'

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

export type TemporalValueNormalizer = (value: unknown, path: string) => string

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

	if (
		'list' in options &&
		options.list !== undefined &&
		options.list !== false
	) {
		throw new TypeError('autoNow cannot be used with list fields')
	}
}

/**
 * Builds the common option-dependent configuration used by time-bearing fields.
 */
export const createTemporalFieldConfigurationResolver =
	<TOptions extends TimezoneTemporalFieldOptions>(
		optionsContract: BuiltInFieldOptionsContract,
		defaultTimezone: boolean,
		createNormalizer: (timezone: boolean) => TemporalValueNormalizer,
	): ScalarFieldConfigurationResolver<TOptions> =>
	(options) => {
		assertFieldOptions(options)
		assertTemporalAutoNow(options)

		const timezone = readTemporalTimezone(
			'timezone' in options ? options.timezone : undefined,
			defaultTimezone,
		)
		const snapshotValue = createNormalizer(timezone)
		const normalizeOptions = <const TDeclaredOptions extends TOptions>(
			declaredOptions: TDeclaredOptions,
		): Readonly<TDeclaredOptions> =>
			normalizeFieldOptions(declaredOptions, snapshotValue, optionsContract)

		// The same normalizer governs defaults and later snapshots.
		return { normalizeOptions, snapshotValue }
	}
