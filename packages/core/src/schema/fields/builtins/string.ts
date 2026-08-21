import { immutableRecord } from '@ultimabase/shared'

import {
	fieldOptionKeys,
	normalizeFieldOptions,
	orderedRangeOptionKeys,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
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
 * Groups string constraints under one validation boundary.
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
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'string', string, StringFieldOptions, TTypegen>

const stringFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'string',
	optionKeys: fieldOptionKeys,
	validationOptionKeys: ['length', 'match'],
	nestedValidation: [{ key: 'length', optionKeys: orderedRangeOptionKeys }],
}

/** Provides string-specific names for the shared compact scalar contract. */
type DefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type ResolvedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'string',
	string,
	StringFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TList, TImmutable, true>

type NonDefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TList, TImmutable, false>

interface StringFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedStringFieldOptions<TRequired, TList, TImmutable>,
	): DefaultedStringField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedStringFieldOptions<TRequired, TList, TImmutable>,
	): NonDefaultedStringField<TRequired, TList, TImmutable>
}

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
		stringFieldOptionsContract,
	)

/**
 * Declares a UTF-16 JavaScript string with optional length and pattern validation.
 *
 * @example
 * ```ts
 * stringField({
 *   required: true,
 *   validation: { length: { min: 2 }, match: /^[a-z]+$/u },
 * })
 * ```
 */
export const stringField: StringFieldFactory = createCompactScalarFieldFactory<
	'string',
	string,
	StringFieldOptions
>('string', normalizeStringFieldOptions, normalizeStringValue)
