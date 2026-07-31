import { immutableRecord } from '@ultimabase/shared'

import { createFieldDefinition } from '../base/definition.js'
import {
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
	normalizeLengthValidation,
	type LengthConstrainedValidation,
	type LengthValidationOptions,
} from '../constraints/length.js'
import { normalizeStringValue } from '../base/value.js'

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

const normalizeStringValidation = (
	validation: StringValidationOptions,
): Readonly<StringValidationOptions> => {
	const normalized = normalizeLengthValidation(validation)

	if (normalized.match !== undefined && !(normalized.match instanceof RegExp)) {
		throw new TypeError('validation.match must be a RegExp')
	}

	if (normalized.match === undefined) {
		return normalized
	}

	// A frozen copy prevents caller state and global `lastIndex` mutations from leaking in.
	return immutableRecord({
		...normalized,
		match: Object.freeze(
			new RegExp(normalized.match.source, normalized.match.flags),
		),
	})
}

/**
 * Creates an optional, non-null string field with no additional metadata.
 */
export function stringField(): StringField<EmptyFieldOptions>

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
	options: StringFieldOptions = emptyFieldOptions,
): StringField {
	return createFieldDefinition(
		'string',
		normalizeFieldOptions(
			options,
			normalizeStringValidation,
			normalizeStringValue,
		),
		normalizeStringValue,
	)
}
