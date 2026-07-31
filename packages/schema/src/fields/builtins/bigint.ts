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
export type BigintFieldOptions = FieldOptions<
	bigint,
	BigintValidationOptions
> & {
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

/** Creates immutable bigint metadata with optional sequence ownership. */
export const bigintField: ScalarFieldFactory<
	'bigint',
	bigint,
	BigintFieldOptions
> = createScalarFieldFactory(
	'bigint',
	normalizeBigintFieldOptions,
	normalizeBigintValue,
)
