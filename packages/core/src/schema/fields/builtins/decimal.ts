import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	FieldValidationOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompatibleScalarPresence,
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
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
export interface DecimalValidationOptions extends FieldValidationOptions {
	/**
	 * Limits the total number of integer and fractional digits.
	 *
	 * @example `precision: 12`
	 */
	readonly precision?: number
	/**
	 * Limits the number of digits after the decimal separator.
	 *
	 * @example `scale: 2`
	 */
	readonly scale?: number
	/**
	 * Restricts exact decimal strings with inclusive boundaries.
	 *
	 * @example `range: { min: "0.00", max: "999.99" }`
	 */
	readonly range?: DecimalRangeValidationOptions
}

/**
 * Describes exact decimal metadata through lossless strings.
 */
export type DecimalFieldOptions = FieldOptions<string, DecimalValidationOptions>

/**
 * Carries exact decimal strings and their compact operation state.
 */
export type DecimalField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'decimal', string, DecimalFieldOptions, TInference>

/** Keeps the defaulted decimal input readable in editor signatures. */
type DefaultedDecimalFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

/** Keeps the default-free decimal input readable in editor signatures. */
type NonDefaultedDecimalFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

/** Resolves the common decimal inference state once for both overload branches. */
type ResolvedDecimalField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'decimal',
	string,
	DecimalFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

/** Names a decimal field whose value is supplied by a declared default. */
type DefaultedDecimalField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<TRequired, TNullable, TList, TImmutable, true>

/** Names a decimal field without a declared default value. */
type NonDefaultedDecimalField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<TRequired, TNullable, TList, TImmutable, false>

/** Exposes concise overloads while the shared factory owns runtime behavior. */
interface DecimalFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedDecimalFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): DefaultedDecimalField<TRequired, TNullable, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedDecimalFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): NonDefaultedDecimalField<TRequired, TNullable, TList, TImmutable>
}

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

/** Compares two already normalized exact decimals without numeric coercion. */
export const compareDecimalValues = (left: string, right: string): number => {
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

/** Applies one exact decimal delta without converting either operand to a number. */
export const applyDecimalDelta = (
	current: string,
	delta: string,
	operation: 'decrement' | 'increment',
): string => {
	const currentDecimal = parseDecimal(current)
	const deltaDecimal = parseDecimal(delta)
	const commonScale = Math.max(currentDecimal.scale, deltaDecimal.scale)
	const currentCoefficient =
		currentDecimal.coefficient *
		10n ** BigInt(commonScale - currentDecimal.scale)
	const deltaCoefficient =
		deltaDecimal.coefficient * 10n ** BigInt(commonScale - deltaDecimal.scale)
	const coefficient =
		operation === 'increment'
			? currentCoefficient + deltaCoefficient
			: currentCoefficient - deltaCoefficient
	const sign = coefficient < 0n ? '-' : ''
	const digits = (coefficient < 0n ? -coefficient : coefficient)
		.toString()
		.padStart(commonScale + 1, '0')

	if (commonScale === 0) return `${sign}${digits}`

	return `${sign}${digits.slice(0, -commonScale)}.${digits.slice(-commonScale)}`
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
			compareDecimalValues,
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

/**
 * Declares an exact base-10 decimal represented as a string to avoid floating-point loss.
 *
 * @example
 * ```ts
 * decimalField({ validation: { precision: 12, scale: 2 }, default: "0.00" })
 * ```
 */
export const decimalField: DecimalFieldFactory =
	createCompactScalarFieldFactory<'decimal', string, DecimalFieldOptions>(
		'decimal',
		normalizeDecimalFieldOptions,
		normalizeDecimalValue,
	)
