import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	ValidatedFieldOptions,
} from './field.js'
import {
	normalizeLengthValidation,
	type LengthConstrainedValidation,
	type LengthValidationOptions,
} from './length-validation.js'

type EmptyStringFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines declarative string length boundaries.
 */
export type StringLengthValidationOptions = LengthValidationOptions

/**
 * Groups presence and string constraints under one validation boundary.
 */
export type StringValidationOptions = LengthConstrainedValidation & {
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

const normalizeStringValidation = (
	validation: StringValidationOptions,
): Readonly<StringValidationOptions> => normalizeLengthValidation(validation)

/**
 * Creates an optional, non-null string field with no additional metadata.
 */
export function stringField(): StringField<EmptyStringFieldOptions>

/**
 * Creates immutable string field metadata while preserving every option literal.
 */
export function stringField<const TOptions extends StringFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, string> extends never
			? never
			: unknown),
): StringField<TOptions>

export function stringField(
	options: StringFieldOptions = emptyStringFieldOptions,
): StringField {
	return immutableRecord({
		kind: 'string',
		options: normalizeFieldOptions(options, normalizeStringValidation),
	})
}
