import {
	fieldOptionKeys,
	fieldValidationOptionKeys,
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
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'binary', Uint8Array, BinaryFieldOptions, TTypegen>

const binaryFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'binary',
	optionKeys: fieldOptionKeys,
	validationOptionKeys: [...fieldValidationOptionKeys, 'length'],
	nestedValidation: [{ key: 'length', optionKeys: orderedRangeOptionKeys }],
}

/** Provides binary-specific names for the shared compact scalar contract. */
type DefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TList,
	TImmutable
>

type ResolvedBinaryField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'binary',
	Uint8Array,
	BinaryFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedBinaryField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBinaryField<TRequired, TList, TImmutable, true>

type NonDefaultedBinaryField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBinaryField<TRequired, TList, TImmutable, false>

interface BinaryFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedBinaryFieldOptions<TRequired, TList, TImmutable>,
	): DefaultedBinaryField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedBinaryFieldOptions<TRequired, TList, TImmutable>,
	): NonDefaultedBinaryField<TRequired, TList, TImmutable>
}

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
	normalizeFieldOptions(
		options,
		normalizeLengthValidation,
		snapshotBinaryValue,
		binaryFieldOptionsContract,
	)

/**
 * Declares native binary data as a `Uint8Array`; adapters choose its transport and storage encoding.
 *
 * @example
 * ```ts
 * binaryField({ validation: { length: { max: 5_000_000 } } })
 * ```
 */
export const binaryField: BinaryFieldFactory = createCompactScalarFieldFactory<
	'binary',
	Uint8Array,
	BinaryFieldOptions
>('binary', normalizeBinaryFieldOptions, snapshotBinaryValue)
