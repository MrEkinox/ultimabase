import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from './field.js'
import { normalizeNumericRange, type NumericRange } from './numeric-range.js'

type EmptyStringFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines declarative string length boundaries.
 */
export type StringLengthValidationOptions = NumericRange

/**
 * Groups presence and string constraints under one validation boundary.
 */
export type StringValidationOptions = FieldValidationOptions & {
	readonly length?: StringLengthValidationOptions
	readonly match?: RegExp
}

/**
 * Describes string metadata without coupling validation to a runtime.
 */
export type StringFieldOptions = FieldOptions<string, StringValidationOptions>

/**
 * Carries the string value type and exact options through later schema inference.
 */
export type StringField<
	TOptions extends StringFieldOptions = StringFieldOptions,
> = FieldDefinition<'string', string, TOptions>

const emptyStringFieldOptions: EmptyStringFieldOptions = immutableRecord({})

/**
 * Keeps length metadata portable across JavaScript and database validators.
 */
const assertValidLength = (
	name: 'min' | 'max',
	value: number | undefined,
): void => {
	if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
		throw new RangeError(
			`validation.length.${name} must be a non-negative safe integer`,
		)
	}
}

const normalizeStringValidation = (
	validation: StringValidationOptions,
): Readonly<StringValidationOptions> => {
	const { length } = validation

	// Nested length metadata is copied before the containing validation object is frozen.
	return length === undefined
		? immutableRecord(validation)
		: immutableRecord({
				...validation,
				length: normalizeNumericRange(
					length,
					'validation.length',
					assertValidLength,
				),
			})
}

/**
 * Creates an optional, non-null string field with no additional metadata.
 */
export function stringField(): StringField<EmptyStringFieldOptions>

/**
 * Creates immutable string field metadata while preserving every option literal.
 */
export function stringField<const TOptions extends StringFieldOptions>(
	options: TOptions,
): StringField<TOptions>

export function stringField(
	options: StringFieldOptions = emptyStringFieldOptions,
): StringField {
	return immutableRecord({
		kind: 'string',
		options: normalizeFieldOptions(options, normalizeStringValidation),
	})
}
