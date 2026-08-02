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
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'binary', Uint8Array, BinaryFieldOptions, TInference>

/** Provides binary-specific names for the shared compact scalar contract. */
type DefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type NonDefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type ResolvedBinaryField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'binary',
	Uint8Array,
	BinaryFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedBinaryField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBinaryField<TRequired, TNullable, TList, TImmutable, true>

type NonDefaultedBinaryField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBinaryField<TRequired, TNullable, TList, TImmutable, false>

interface BinaryFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedBinaryFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): DefaultedBinaryField<TRequired, TNullable, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedBinaryFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): NonDefaultedBinaryField<TRequired, TNullable, TList, TImmutable>
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
	normalizeFieldOptions(options, normalizeLengthValidation, snapshotBinaryValue)

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
