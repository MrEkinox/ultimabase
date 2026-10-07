import {
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'

/** Describes exact decimal metadata through lossless strings. */
export interface DecimalFieldOptions extends FieldOptions<string> {
	/**
	 * Limits the total number of integer and fractional digits.
	 *
	 * Database adapters may inspect this structural shape when selecting
	 * fixed-precision storage.
	 *
	 * @example `precision: 12`
	 */
	readonly precision?: number
	/**
	 * Limits the number of digits after the decimal separator.
	 *
	 * Database adapters may inspect this structural shape together with
	 * precision when selecting fixed-scale storage.
	 *
	 * @example `scale: 2`
	 */
	readonly scale?: number
}

/**
 * Carries exact decimal strings and their compact operation state.
 */
export type DecimalField<
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'decimal', string, DecimalFieldOptions, TTypegen>

const decimalFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'decimal',
	optionKeys: [...fieldOptionKeys, 'precision', 'scale'],
}

type DefaultedDecimalFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedDecimalFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type ResolvedDecimalField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'decimal',
	string,
	DecimalFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedDecimalField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<TRequired, TList, TImmutable, true>

type NonDefaultedDecimalField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<TRequired, TList, TImmutable, false>

export interface DecimalFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedDecimalFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedDecimalField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedDecimalFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): NonDefaultedDecimalField<TRequired, TList, TImmutable>
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
		throw new RangeError('precision must be a positive safe integer')
	}
}

const assertValidScale = (scale: number | undefined): void => {
	if (scale !== undefined && (!Number.isSafeInteger(scale) || scale < 0)) {
		throw new RangeError('scale must be a non-negative safe integer')
	}
}

const normalizeDecimalFieldOptions = <
	const TOptions extends DecimalFieldOptions,
>(
	options: TOptions,
): Readonly<TOptions> => {
	assertValidPrecision(options.precision)
	assertValidScale(options.scale)

	if (
		options.precision !== undefined &&
		options.scale !== undefined &&
		options.scale > options.precision
	) {
		throw new RangeError('scale cannot be greater than precision')
	}

	return normalizeFieldOptions(
		options,
		normalizeDecimalValue,
		decimalFieldOptionsContract,
	)
}

/**
 * Declares an exact base-10 decimal represented as a string to avoid floating-point loss.
 *
 * @example
 * ```ts
 * decimalField({ precision: 12, scale: 2, default: "0.00" })
 * ```
 */
export const decimalField: DecimalFieldFactory =
	createCompactScalarFieldFactory<'decimal', string, DecimalFieldOptions>(
		'decimal',
		normalizeDecimalFieldOptions,
		normalizeDecimalValue,
	)
