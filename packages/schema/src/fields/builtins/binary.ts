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

const normalizeBinaryFieldOptions = <const TOptions extends BinaryFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeLengthValidation, snapshotBinaryValue)

/** Creates binary metadata while copying caller-owned static byte sequences. */
export const binaryField: ScalarFieldFactory<
	'binary',
	Uint8Array,
	BinaryFieldOptions
> = createScalarFieldFactory(
	'binary',
	normalizeBinaryFieldOptions,
	snapshotBinaryValue,
)
