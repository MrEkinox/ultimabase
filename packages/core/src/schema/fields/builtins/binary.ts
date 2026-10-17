import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldOptions,
	FieldTypeState,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'

/**
 * Describes storage-neutral binary metadata through native byte sequences.
 */
export type BinaryFieldOptions = FieldOptions<Uint8Array>

/**
 * Carries native bytes and exact options through schema inference.
 */
export type BinaryField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'binary', Uint8Array, BinaryFieldOptions, TState>

type DefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedBinaryFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	BinaryFieldOptions,
	Uint8Array,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
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

export interface BinaryFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = true,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBinaryFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			Uint8Array,
			ResolvedFieldSourceOptions<TSourceTemplate, Uint8Array, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedBinaryField<TRequired, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBinaryFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			Uint8Array,
			ResolvedFieldSourceOptions<TSourceTemplate, Uint8Array, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedBinaryField<TRequired, TList, TImmutable>
	>
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

/**
 * Declares native binary data as a `Uint8Array`; adapters choose its transport and storage encoding.
 *
 * @example
 * ```ts
 * binaryField({ required: true })
 * ```
 */
export const binaryField: BinaryFieldFactory = createScalarFieldFactory(
	'binary',
	snapshotBinaryValue,
)
