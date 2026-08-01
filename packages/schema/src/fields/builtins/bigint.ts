import { assertFieldOptions, normalizeFieldOptions } from '../base/options.js'
import type { FieldDefinition, FieldOptions } from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	assertAutoIncrementOption,
	normalizeNumericValidation,
	type NumericValidationOptions,
} from '../constraints/numeric.js'
import type { NumericRange } from '../constraints/numeric.js'
import { normalizeBigintValue } from '../base/value.js'

/**
 * Defines declarative boundaries for native JavaScript bigint values.
 */
export type BigintRangeValidationOptions = NumericRange<bigint>

/**
 * Combines common presence rules with exact bigint range constraints.
 */
export type BigintValidationOptions = NumericValidationOptions<bigint>

/**
 * Adds sequence metadata to the exact bigint field contract.
 */
export interface BigintFieldOptions extends FieldOptions<
	bigint,
	BigintValidationOptions
> {
	/**
	 * Requests a database-generated sequence value from adapters that support it.
	 *
	 * @example `autoIncrement: true`
	 */
	readonly autoIncrement?: boolean
}

/**
 * Carries an exact bigint value and its options through schema inference.
 */
export type BigintField<
	TOptions extends BigintFieldOptions = BigintFieldOptions,
> = FieldDefinition<'bigint', bigint, TOptions>

const isBigint = (value: unknown): value is bigint => typeof value === 'bigint'

const normalizeBigintValidation = (
	validation: BigintValidationOptions,
): Readonly<BigintValidationOptions> =>
	normalizeNumericValidation(validation, 'a bigint', isBigint)

const normalizeBigintFieldOptions = <const TOptions extends BigintFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeBigintValidation,
		normalizeBigintValue,
	)
}

/**
 * Declares an exact native `bigint` for integer values outside JavaScript's safe-number range.
 *
 * @example
 * ```ts
 * bigintField({ default: 9_007_199_254_740_993n })
 * ```
 */
export const bigintField: ScalarFieldFactory<
	'bigint',
	bigint,
	BigintFieldOptions
> = createScalarFieldFactory(
	'bigint',
	normalizeBigintFieldOptions,
	normalizeBigintValue,
)
