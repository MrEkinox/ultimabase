import { immutableRecord } from '@ultimabase/shared'

import {
	assertFieldOptionsObject,
	emptyFieldOptions,
	normalizeFieldOptions,
	type EmptyFieldOptions,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	ValidatedFieldOptions,
} from './field.js'
import {
	normalizeNumericValidation,
	type NumericValidationOptions,
} from './numeric-field.js'
import type { NumericRange } from './numeric-range.js'
import { normalizeNumberValue } from './scalar-value.js'

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
	if (
		validation.finite !== undefined &&
		typeof validation.finite !== 'boolean'
	) {
		throw new TypeError('validation.finite must be a boolean')
	}

	return normalizeNumericValidation(
		validation,
		'a finite number',
		Number.isFinite,
	)
}

/**
 * Creates an optional floating-point field with no additional metadata.
 */
export function floatField(): FloatField<EmptyFieldOptions>

/**
 * Creates immutable floating-point metadata while preserving every option literal.
 */
export function floatField<const TOptions extends FloatFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, number> extends never
			? never
			: unknown),
): FloatField<TOptions>

export function floatField(
	options: FloatFieldOptions = emptyFieldOptions,
): FloatField {
	assertFieldOptionsObject(options)

	if ('autoIncrement' in options) {
		throw new TypeError('autoIncrement is only available on integer fields')
	}

	return immutableRecord({
		kind: 'float',
		options: normalizeFieldOptions(
			options,
			normalizeFloatValidation,
			normalizeNumberValue,
		),
	})
}
