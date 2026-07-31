import { immutableRecord } from '@ultimabase/shared'

import {
	emptyFieldOptions,
	normalizeFieldOptions,
	type EmptyFieldOptions,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from './field.js'

/**
 * Defines exact decimal boundaries without floating-point coercion.
 */
export interface DecimalRangeValidationOptions {
	readonly min?: string
	readonly max?: string
}

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

	const min =
		range.min === undefined
			? undefined
			: normalizeDecimalValue(range.min, 'validation.range.min')
	const max =
		range.max === undefined
			? undefined
			: normalizeDecimalValue(range.max, 'validation.range.max')

	if (min !== undefined && max !== undefined && compareDecimals(min, max) > 0) {
		throw new RangeError(
			'validation.range.min cannot be greater than validation.range.max',
		)
	}

	return immutableRecord({
		...validation,
		range: immutableRecord({
			...range,
			...(min === undefined ? {} : { min }),
			...(max === undefined ? {} : { max }),
		}),
	})
}

const normalizeDecimalFieldOptions = (
	options: DecimalFieldOptions,
): Readonly<DecimalFieldOptions> =>
	normalizeFieldOptions(
		options,
		normalizeDecimalValidation,
		normalizeDecimalValue,
	)

/**
 * Creates an optional exact decimal field with no additional metadata.
 */
export function decimalField(): DecimalField<EmptyFieldOptions>

/**
 * Creates exact decimal metadata while preserving every option literal.
 */
export function decimalField<const TOptions extends DecimalFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, string> extends never
			? never
			: unknown),
): DecimalField<TOptions>

export function decimalField(
	options: DecimalFieldOptions = emptyFieldOptions,
): DecimalField {
	return immutableRecord({
		kind: 'decimal',
		options: normalizeDecimalFieldOptions(options),
	})
}
