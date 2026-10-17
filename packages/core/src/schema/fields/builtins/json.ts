import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
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
import { snapshotJsonValue, type JsonDocument } from '../base/portable-json.js'

export { snapshotJsonValue } from '../base/portable-json.js'
export type {
	JsonArray,
	JsonDocument,
	JsonObject,
	JsonPrimitive,
	JsonValue,
} from '../base/portable-json.js'

/**
 * Describes unstructured JSON metadata without exposing an unsafe value type.
 */
export type JsonFieldOptions = FieldOptions<JsonDocument>

/**
 * Carries the portable root JSON document contract through schema inference.
 */
export type JsonField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'json', JsonDocument, JsonFieldOptions, TState>

type DefaultedJsonFieldOptions<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TNullable,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type ResolvedJsonField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'json',
	JsonDocument,
	JsonFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedJsonField<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<DefaultedFieldNonNull<TNullable>, TList, TImmutable, true>

type NonDefaultedJsonField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<TRequired, TList, TImmutable, false>

export interface JsonFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedJsonFieldOptions<TNullable, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			JsonDocument,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				JsonDocument,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedJsonField<TNullable, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedJsonFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			JsonDocument,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				JsonDocument,
				TList,
				TRequired
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedJsonField<TRequired, TList, TImmutable>
	>
}

/** Copies one root JSON document while reserving scalar nullability for field metadata. */
const snapshotJsonDocument = (value: unknown, path: string): JsonDocument => {
	const normalized = snapshotJsonValue(value, path)

	if (normalized !== null && typeof normalized === 'object') {
		return normalized
	}

	throw new TypeError(`${path} must be a JSON object or array`)
}

/**
 * Declares an unstructured JSON object or array containing portable JSON values.
 *
 * @example
 * ```ts
 * jsonField({ default: { theme: "dark", notifications: true } })
 * ```
 */
export const jsonField: JsonFieldFactory = createScalarFieldFactory(
	'json',
	snapshotJsonDocument,
)
