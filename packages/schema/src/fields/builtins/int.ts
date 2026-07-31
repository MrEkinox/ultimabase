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
export type IntFieldOptions = FieldOptions<number, IntValidationOptions> & {
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

/** Creates immutable safe-integer metadata with optional sequence ownership. */
export const intField: ScalarFieldFactory<'int', number, IntFieldOptions> =
	createScalarFieldFactory(
		'int',
		normalizeIntFieldOptions,
		normalizeSafeIntegerValue,
	)
