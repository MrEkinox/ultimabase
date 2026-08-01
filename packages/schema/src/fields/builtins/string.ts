import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompatibleScalarPresence,
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
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'string', string, StringFieldOptions, TInference>

/** Provides string-specific names for the shared compact scalar contract. */
type DefaultedStringFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type NonDefaultedStringFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type ResolvedStringField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'string',
	string,
	StringFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedStringField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TNullable, TList, TImmutable, true>

type NonDefaultedStringField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TNullable, TList, TImmutable, false>

interface StringFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedStringFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): DefaultedStringField<TRequired, TNullable, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedStringFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): NonDefaultedStringField<TRequired, TNullable, TList, TImmutable>
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
export const stringField: StringFieldFactory = createCompactScalarFieldFactory<
	'string',
	string,
	StringFieldOptions
>('string', normalizeStringFieldOptions, normalizeStringValue)
