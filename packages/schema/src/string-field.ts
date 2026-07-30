import { immutableRecord } from '@ultimabase/shared'

import { defineExtensions } from './extension.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from './field.js'

type EmptyStringFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines declarative string length boundaries.
 */
export interface StringLengthValidationOptions {
	readonly min?: number
	readonly max?: number
}

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

	assertValidLength('min', length?.min)
	assertValidLength('max', length?.max)

	if (
		length?.min !== undefined &&
		length.max !== undefined &&
		length.min > length.max
	) {
		throw new RangeError(
			'validation.length.min cannot be greater than validation.length.max',
		)
	}

	// Nested length metadata is copied before the containing validation object is frozen.
	return length === undefined
		? immutableRecord(validation)
		: immutableRecord({ ...validation, length: immutableRecord(length) })
}

/**
 * Validates and copies options before they cross the schema boundary.
 */
const normalizeStringFieldOptions = (
	options: StringFieldOptions,
): Readonly<StringFieldOptions> => {
	const validation =
		options.validation === undefined
			? undefined
			: normalizeStringValidation(options.validation)
	const extensions =
		options.extensions === undefined
			? undefined
			: defineExtensions(options.extensions)

	// Conditional spreads preserve the distinction between absent and undefined options.
	return immutableRecord({
		...options,
		...(validation === undefined ? {} : { validation }),
		...(extensions === undefined ? {} : { extensions }),
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
		options: normalizeStringFieldOptions(options),
	})
}
