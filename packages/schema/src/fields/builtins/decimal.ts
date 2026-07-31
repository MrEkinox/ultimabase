import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	normalizeOrderedRange,
	type OrderedRange,
} from '../constraints/range.js'

/**
 * Defines exact decimal boundaries without floating-point coercion.
 */
export type DecimalRangeValidationOptions = OrderedRange<string>

/**
 * Groups presence, digit, scale, and exact range constraints.
 */
export type DecimalValidationOptions = FieldValidationOptions & {
	readonly precision?: number
	readonly scale?: number
	readonly range?: DecimalRangeValidationOptions
}

/**
 * Describes exact decimal metadata through lossless strings.
 */
export type DecimalFieldOptions = FieldOptions<string, DecimalValidationOptions>

/**
 * Carries exact decimal strings and options through schema inference.
 */
export type DecimalField<
	TOptions extends DecimalFieldOptions = DecimalFieldOptions,
> = FieldDefinition<'decimal', string, TOptions>

interface ParsedDecimal {
	readonly coefficient: bigint
	readonly scale: number
}

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u

const parseDecimal = (value: string): ParsedDecimal => {
	const unsigned = value.startsWith('-') ? value.slice(1) : value
	const [integer = '', fraction = ''] = unsigned.split('.')
	const sign = value.startsWith('-') ? '-' : ''

	return {
		coefficient: BigInt(`${sign}${integer}${fraction}`),
		scale: fraction.length,
	}
}

/**
 * Normalizes exact decimal defaults and boundaries without numeric coercion.
 */
export const normalizeDecimalValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be an exact decimal string`)
	}

	if (!decimalPattern.test(value)) {
		throw new RangeError(`${path} must be a valid exact decimal string`)
	}

	const parsed = parseDecimal(value)

	if (value.startsWith('-') && parsed.coefficient === 0n) {
		throw new RangeError(`${path} must not use a negative zero representation`)
	}

	return value
}

const compareDecimals = (left: string, right: string): number => {
	const leftDecimal = parseDecimal(left)
	const rightDecimal = parseDecimal(right)
	const commonScale = Math.max(leftDecimal.scale, rightDecimal.scale)
	const leftCoefficient =
		leftDecimal.coefficient * 10n ** BigInt(commonScale - leftDecimal.scale)
	const rightCoefficient =
		rightDecimal.coefficient * 10n ** BigInt(commonScale - rightDecimal.scale)

	return leftCoefficient < rightCoefficient
		? -1
		: leftCoefficient > rightCoefficient
			? 1
			: 0
}

const assertValidPrecision = (precision: number | undefined): void => {
	if (
		precision !== undefined &&
		(!Number.isSafeInteger(precision) || precision < 1)
	) {
		throw new RangeError('validation.precision must be a positive safe integer')
	}
}

const assertValidScale = (scale: number | undefined): void => {
	if (scale !== undefined && (!Number.isSafeInteger(scale) || scale < 0)) {
		throw new RangeError('validation.scale must be a non-negative safe integer')
	}
}

const normalizeDecimalValidation = (
	validation: DecimalValidationOptions,
): Readonly<DecimalValidationOptions> => {
	assertValidPrecision(validation.precision)
	assertValidScale(validation.scale)

	if (
		validation.precision !== undefined &&
		validation.scale !== undefined &&
		validation.scale > validation.precision
	) {
		throw new RangeError(
			'validation.scale cannot be greater than validation.precision',
		)
	}

	const { range } = validation

	if (range === undefined) {
		return immutableRecord(validation)
	}

	return immutableRecord({
		...validation,
		range: normalizeOrderedRange(
			range,
			'validation.range',
			normalizeDecimalValue,
			compareDecimals,
		),
	})
}

const normalizeDecimalFieldOptions = <
	const TOptions extends DecimalFieldOptions,
>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(
		options,
		normalizeDecimalValidation,
		normalizeDecimalValue,
	)

/** Creates immutable exact-decimal metadata without numeric coercion. */
export const decimalField: ScalarFieldFactory<
	'decimal',
	string,
	DecimalFieldOptions
> = createScalarFieldFactory(
	'decimal',
	normalizeDecimalFieldOptions,
	normalizeDecimalValue,
)
