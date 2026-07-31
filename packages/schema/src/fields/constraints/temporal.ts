import { assertOptionalBoolean, immutableRecord } from '@ultimabase/shared'

import type { FieldOptions, FieldValidationOptions } from '../base/contract.js'
import type { ScalarFieldConfigurationResolver } from '../base/factory.js'
import { assertFieldOptions, normalizeFieldOptions } from '../base/options.js'
import {
	normalizeOrderedRange,
	type OrderedRange,
	type RangeValueComparator,
} from './range.js'

/**
 * Defines ordered string boundaries shared by temporal field kinds.
 */
export type TemporalRangeValidationOptions = OrderedRange<string>

/**
 * Groups presence rules with an optional ordered temporal range.
 */
export type TemporalValidationOptions = FieldValidationOptions & {
	readonly range?: TemporalRangeValidationOptions
}

type AutoNowTemporalFieldOptions<
	TValidation extends TemporalValidationOptions,
> = Omit<FieldOptions<string, TValidation, false>, 'default'> & {
	readonly autoNow: true
	readonly default?: never
}

type DeclaredDefaultTemporalFieldOptions<
	TValidation extends TemporalValidationOptions,
> = FieldOptions<string, TValidation> & {
	readonly autoNow?: false
}

/** Keeps operation-clock generation distinct from developer-owned defaults. */
export type TemporalFieldOptions<
	TValidation extends TemporalValidationOptions = TemporalValidationOptions,
> =
	| AutoNowTemporalFieldOptions<TValidation>
	| DeclaredDefaultTemporalFieldOptions<TValidation>

/** Adds timezone policy only to time-bearing temporal fields. */
export type TimezoneTemporalFieldOptions<
	TValidation extends TemporalValidationOptions = TemporalValidationOptions,
> = TemporalFieldOptions<TValidation> & {
	readonly timezone?: boolean
}

export type TemporalValueNormalizer = (value: unknown, path: string) => string
export type TemporalValueComparator = RangeValueComparator<string>

/**
 * Copies temporal validation metadata while validating and ordering its boundaries.
 */
export const normalizeTemporalValidation = <
	const TValidation extends TemporalValidationOptions,
>(
	validation: TValidation,
	normalizeValue: TemporalValueNormalizer,
	compareValues: TemporalValueComparator,
): Readonly<TValidation> => {
	const { range } = validation

	if (range === undefined) {
		return immutableRecord(validation)
	}

	return immutableRecord({
		...validation,
		range: normalizeOrderedRange(
			range,
			'validation.range',
			normalizeValue,
			compareValues,
		),
	})
}

/**
 * Compares fixed-width canonical temporal strings in chronological order.
 */
export const compareCanonicalTemporalValues: TemporalValueComparator = (
	left,
	right,
) => left.localeCompare(right)

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
		defaultTimezone: boolean,
		createNormalizer: (timezone: boolean) => TemporalValueNormalizer,
		compareZonedValues: TemporalValueComparator,
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
			normalizeFieldOptions(
				declaredOptions,
				(validation) =>
					normalizeTemporalValidation(
						validation,
						snapshotValue,
						timezone ? compareZonedValues : compareCanonicalTemporalValues,
					),
				snapshotValue,
			)

		// The same normalizer governs defaults, ranges, and later snapshots.
		return { normalizeOptions, snapshotValue }
	}
