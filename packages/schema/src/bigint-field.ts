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

type EmptyBigintFieldOptions = Readonly<Record<PropertyKey, never>>

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

const emptyBigintFieldOptions: EmptyBigintFieldOptions = immutableRecord({})

const isBigint = (value: unknown): value is bigint => typeof value === 'bigint'

const normalizeBigintValidation = (
	validation: BigintValidationOptions,
): Readonly<BigintValidationOptions> =>
	normalizeNumericValidation(validation, 'a bigint', isBigint)

/**
 * Creates an optional exact bigint field with no additional metadata.
 */
export function bigintField(): BigintField<EmptyBigintFieldOptions>

/**
 * Creates immutable bigint metadata while preserving every option literal.
 */
export function bigintField<const TOptions extends BigintFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, bigint> extends never
			? never
			: unknown),
): BigintField<TOptions>

export function bigintField(
	options: BigintFieldOptions = emptyBigintFieldOptions,
): BigintField {
	return immutableRecord({
		kind: 'bigint',
		options: normalizeFieldOptions(options, normalizeBigintValidation),
	})
}
