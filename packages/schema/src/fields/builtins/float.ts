import { assertOptionalBoolean } from '@ultimabase/shared'
import { assertFieldOptions, normalizeFieldOptions } from '../base/options.js'
import type { FieldDefinition, FieldOptions } from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	normalizeNumericValidation,
	type NumericValidationOptions,
} from '../constraints/numeric.js'
import type { NumericRange } from '../constraints/numeric.js'
import { normalizeNumberValue } from '../base/value.js'

/**
 * Defines declarative boundaries for floating-point values.
 */
export type FloatRangeValidationOptions = NumericRange

/**
 * Adds finite-value control to the common numeric validation contract.
 */
export type FloatValidationOptions = NumericValidationOptions & {
	readonly finite?: boolean
}

/**
 * Describes floating-point metadata without promising decimal precision.
 */
export type FloatFieldOptions = FieldOptions<number, FloatValidationOptions>

/**
 * Carries a floating-point number and exact options through schema inference.
 */
export type FloatField<TOptions extends FloatFieldOptions = FloatFieldOptions> =
	FieldDefinition<'float', number, TOptions>

const normalizeFloatValidation = (
	validation: FloatValidationOptions,
): Readonly<FloatValidationOptions> => {
	assertOptionalBoolean(validation.finite, 'validation.finite')

	return normalizeNumericValidation(
		validation,
		'a finite number',
		Number.isFinite,
	)
}

const normalizeFloatFieldOptions = <const TOptions extends FloatFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)

	if ('autoIncrement' in options) {
		throw new TypeError('autoIncrement is only available on integer fields')
	}

	return normalizeFieldOptions(
		options,
		normalizeFloatValidation,
		normalizeNumberValue,
	)
}

/** Creates immutable floating-point metadata without decimal guarantees. */
export const floatField: ScalarFieldFactory<
	'float',
	number,
	FloatFieldOptions
> = createScalarFieldFactory(
	'float',
	normalizeFloatFieldOptions,
	normalizeNumberValue,
)
