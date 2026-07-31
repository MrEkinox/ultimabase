import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from './field.js'

type EmptyUuidFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Lists the UUID versions identifiable through the standard version nibble.
 */
export type UuidVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Combines presence rules with an optional accepted UUID version.
 */
export type UuidValidationOptions = FieldValidationOptions & {
	readonly version?: UuidVersion
}

/**
 * Describes storage-neutral UUID metadata through its canonical string value.
 */
export type UuidFieldOptions = FieldOptions<string, UuidValidationOptions>

/**
 * Carries the UUID value and exact options through schema inference.
 */
export type UuidField<TOptions extends UuidFieldOptions = UuidFieldOptions> =
	FieldDefinition<'uuid', string, TOptions>

const emptyUuidFieldOptions: EmptyUuidFieldOptions = immutableRecord({})

const normalizeUuidValidation = (
	validation: UuidValidationOptions,
): Readonly<UuidValidationOptions> => {
	const { version } = validation

	if (
		version !== undefined &&
		(!Number.isInteger(version) || version < 1 || version > 8)
	) {
		throw new RangeError('validation.version must be an integer from 1 to 8')
	}

	// The normalized version remains declarative for every runtime validator.
	return immutableRecord(validation)
}

/**
 * Creates an optional UUID field that accepts every standard version.
 */
export function uuidField(): UuidField<EmptyUuidFieldOptions>

/**
 * Creates immutable UUID metadata while preserving every option literal.
 */
export function uuidField<const TOptions extends UuidFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, string> extends never
			? never
			: unknown),
): UuidField<TOptions>

export function uuidField(
	options: UuidFieldOptions = emptyUuidFieldOptions,
): UuidField {
	return immutableRecord({
		kind: 'uuid',
		options: normalizeFieldOptions(options, normalizeUuidValidation),
	})
}
