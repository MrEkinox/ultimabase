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

type EmptyBinaryFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines byte-length boundaries for binary values.
 */
export type BinaryLengthValidationOptions = LengthValidationOptions

/**
 * Groups presence and byte-length constraints under one validation boundary.
 */
export type BinaryValidationOptions = LengthConstrainedValidation

/**
 * Describes storage-neutral binary metadata through native byte sequences.
 */
export type BinaryFieldOptions = FieldOptions<
	Uint8Array,
	BinaryValidationOptions
>

/**
 * Carries native bytes and exact options through schema inference.
 */
export type BinaryField<
	TOptions extends BinaryFieldOptions = BinaryFieldOptions,
> = FieldDefinition<'binary', Uint8Array, TOptions>

const emptyBinaryFieldOptions: EmptyBinaryFieldOptions = immutableRecord({})

/**
 * Copies one native byte sequence while preserving Buffer values for precise metadata.
 */
export const snapshotBinaryValue = (
	value: unknown,
	path: string,
): Uint8Array => {
	if (!(value instanceof Uint8Array)) {
		throw new TypeError(`${path} must be a Uint8Array`)
	}

	// Typed-array mapping creates independent storage and preserves Buffer subclasses.
	return value.map((byte) => byte)
}

const normalizeBinaryFieldOptions = (
	options: BinaryFieldOptions,
): Readonly<BinaryFieldOptions> =>
	normalizeFieldOptions(options, normalizeLengthValidation, snapshotBinaryValue)

/**
 * Creates an optional binary field with no additional metadata.
 */
export function binaryField(): BinaryField<EmptyBinaryFieldOptions>

/**
 * Creates binary metadata while preserving exact options and copying static bytes.
 */
export function binaryField<const TOptions extends BinaryFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, Uint8Array> extends never
			? never
			: unknown),
): BinaryField<TOptions>

export function binaryField(
	options: BinaryFieldOptions = emptyBinaryFieldOptions,
): BinaryField {
	return immutableRecord({
		kind: 'binary',
		options: normalizeBinaryFieldOptions(options),
	})
}
