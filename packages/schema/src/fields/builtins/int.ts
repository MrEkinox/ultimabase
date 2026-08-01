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
import { normalizeSafeIntegerValue } from '../base/value.js'

/**
 * Defines declarative boundaries for safe JavaScript integers.
 */
export type IntRangeValidationOptions = NumericRange

/**
 * Combines common presence rules with safe-integer range constraints.
 */
export type IntValidationOptions = NumericValidationOptions

/**
 * Adds integer-only sequence metadata to the common field contract.
 */
export interface IntFieldOptions extends FieldOptions<
	number,
	IntValidationOptions
> {
	/**
	 * Requests a database-generated sequence value from adapters that support it.
	 *
	 * @example `autoIncrement: true`
	 */
	readonly autoIncrement?: boolean
}

/**
 * Carries a safe integer and its exact options through schema inference.
 */
export type IntField<TOptions extends IntFieldOptions = IntFieldOptions> =
	FieldDefinition<'int', number, TOptions>

const normalizeIntValidation = (
	validation: IntValidationOptions,
): Readonly<IntValidationOptions> =>
	normalizeNumericValidation(validation, 'a safe integer', Number.isSafeInteger)

const normalizeIntFieldOptions = <const TOptions extends IntFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeIntValidation,
		normalizeSafeIntegerValue,
	)
}

/**
 * Declares a safe JavaScript integer between `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * ```ts
 * intField({ default: 0, validation: { range: { min: 0 } } })
 * ```
 */
export const intField: ScalarFieldFactory<'int', number, IntFieldOptions> =
	createScalarFieldFactory(
		'int',
		normalizeIntFieldOptions,
		normalizeSafeIntegerValue,
	)
