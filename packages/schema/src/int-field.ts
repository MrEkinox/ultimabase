import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
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

type EmptyIntFieldOptions = Readonly<Record<PropertyKey, never>>

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

const emptyIntFieldOptions: EmptyIntFieldOptions = immutableRecord({})

const normalizeIntValidation = (
	validation: IntValidationOptions,
): Readonly<IntValidationOptions> =>
	normalizeNumericValidation(validation, 'a safe integer', Number.isSafeInteger)

/**
 * Creates an optional safe-integer field with no additional metadata.
 */
export function intField(): IntField<EmptyIntFieldOptions>

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
	options: IntFieldOptions = emptyIntFieldOptions,
): IntField {
	return immutableRecord({
		kind: 'int',
		options: normalizeFieldOptions(options, normalizeIntValidation),
	})
}
