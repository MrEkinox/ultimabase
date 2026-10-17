import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldOptions,
	FieldTypeState,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
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
export type DecimalField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'decimal', string, DecimalFieldOptions, TState>

type DefaultedDecimalFieldOptions<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TNullable,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedDecimalFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	DecimalFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
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
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<
	DefaultedFieldNonNull<TNullable>,
	TList,
	TImmutable,
	true
>

type NonDefaultedDecimalField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedDecimalField<TRequired, TList, TImmutable, false>

export interface DecimalFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedDecimalFieldOptions<TNullable, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				string,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedDecimalField<TNullable, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedDecimalFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedDecimalField<TRequired, TList, TImmutable>
	>
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

/** Rejects impossible fixed-precision shapes before adapters can inspect them. */
const assertDecimalOptions = ({
	precision,
	scale,
}: Readonly<Record<string, unknown>>): void => {
	if (
		precision !== undefined &&
		(typeof precision !== 'number' ||
			!Number.isSafeInteger(precision) ||
			precision < 1)
	) {
		throw new RangeError('precision must be a positive safe integer')
	}

	if (
		scale !== undefined &&
		(typeof scale !== 'number' || !Number.isSafeInteger(scale) || scale < 0)
	) {
		throw new RangeError('scale must be a non-negative safe integer')
	}

	if (precision !== undefined && scale !== undefined && scale > precision) {
		throw new RangeError('scale cannot be greater than precision')
	}
}

/**
 * Declares an exact base-10 decimal represented as a string to avoid floating-point loss.
 *
 * @example
 * ```ts
 * decimalField({ precision: 12, scale: 2, default: "0.00" })
 * ```
 */
export const decimalField: DecimalFieldFactory = createScalarFieldFactory(
	'decimal',
	normalizeDecimalValue,
	{
		optionKeys: ['precision', 'scale'],
		assertOptions: assertDecimalOptions,
	},
)
