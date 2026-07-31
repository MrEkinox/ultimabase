import { createFieldDefinition } from '../base/definition.js'
import {
	assertFieldOptions,
	emptyFieldOptions,
	normalizeFieldOptions,
	type EmptyFieldOptions,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	ValidatedFieldOptions,
} from '../base/contract.js'
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

/**
 * Creates an optional safe-integer field with no additional metadata.
 */
export function intField(): IntField<EmptyFieldOptions>

/**
 * Creates immutable integer metadata while preserving every option literal.
 */
export function intField<const TOptions extends IntFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, number> extends never
			? never
			: unknown),
): IntField<TOptions>

export function intField(
	options: IntFieldOptions = emptyFieldOptions,
): IntField {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return createFieldDefinition(
		'int',
		normalizeFieldOptions(
			options,
			normalizeIntValidation,
			normalizeSafeIntegerValue,
		),
		normalizeSafeIntegerValue,
	)
}
