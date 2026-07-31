import { createFieldDefinition } from './field-definition.js'
import {
	emptyFieldOptions,
	normalizeFieldOptions,
	normalizeFlatValidation,
	type EmptyFieldOptions,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from './field.js'
import { normalizeBooleanValue } from './scalar-value.js'

/**
 * Names the presence-only validation contract exposed by boolean fields.
 */
export type BooleanValidationOptions = FieldValidationOptions

/**
 * Describes boolean metadata through the common field contract.
 */
export type BooleanFieldOptions = FieldOptions<boolean>

/**
 * Carries the boolean value type and exact options through schema inference.
 */
export type BooleanField<
	TOptions extends BooleanFieldOptions = BooleanFieldOptions,
> = FieldDefinition<'boolean', boolean, TOptions>

/**
 * Creates an optional, non-null boolean field with no additional metadata.
 */
export function booleanField(): BooleanField<EmptyFieldOptions>

/**
 * Creates immutable boolean metadata while preserving every option literal.
 */
export function booleanField<const TOptions extends BooleanFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, boolean> extends never
			? never
			: unknown),
): BooleanField<TOptions>

export function booleanField(
	options: BooleanFieldOptions = emptyFieldOptions,
): BooleanField {
	return createFieldDefinition(
		'boolean',
		normalizeFieldOptions(
			options,
			normalizeFlatValidation,
			normalizeBooleanValue,
		),
		normalizeBooleanValue,
	)
}
