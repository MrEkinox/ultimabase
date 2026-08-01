import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type { FieldDefinition, FieldOptions } from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
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
export interface StringValidationOptions extends LengthConstrainedValidation {
	/**
	 * Requires the complete value to satisfy a native regular expression.
	 *
	 * @example `match: /^[a-z0-9-]+$/u`
	 */
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

const normalizeStringFieldOptions = <const TOptions extends StringFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(
		options,
		normalizeStringValidation,
		normalizeStringValue,
	)

/**
 * Declares a UTF-16 JavaScript string with optional length and pattern validation.
 *
 * @example
 * ```ts
 * stringField({
 *   validation: { required: true, length: { min: 2 }, match: /^[a-z]+$/u },
 * })
 * ```
 */
export const stringField: ScalarFieldFactory<
	'string',
	string,
	StringFieldOptions
> = createScalarFieldFactory(
	'string',
	normalizeStringFieldOptions,
	normalizeStringValue,
)
