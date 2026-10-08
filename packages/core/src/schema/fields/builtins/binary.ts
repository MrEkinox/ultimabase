import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
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
export type BinaryField<
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'binary', Uint8Array, BinaryFieldOptions, TTypegen>

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

export interface BinaryFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBinaryFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			Uint8Array,
			ResolvedFieldSourceOptions<TSourceTemplate, Uint8Array, TList, TRequired>
		>,
	): DefaultedBinaryField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBinaryFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			Uint8Array,
			ResolvedFieldSourceOptions<TSourceTemplate, Uint8Array, TList, TRequired>
		>,
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
