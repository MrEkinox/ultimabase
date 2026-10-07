import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarField,
	createScalarFieldFactory,
	type DefaultedScalarFieldOptions,
	type NonDefaultedScalarFieldOptions,
	type ScalarFieldDescriptor,
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
export type JsonField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'json', JsonDocument, JsonFieldOptions, TTypegen>

type JsonScalar = ScalarFieldDescriptor<'json', JsonDocument, JsonFieldOptions>

type DefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedScalarFieldOptions<JsonScalar, TRequired, TList, TImmutable>

type NonDefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedScalarFieldOptions<JsonScalar, TRequired, TList, TImmutable>

type DefaultedJsonField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<JsonScalar, TRequired, TList, TImmutable, true>

type NonDefaultedJsonField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<JsonScalar, TRequired, TList, TImmutable, false>

export interface JsonFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedJsonFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			JsonDocument,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				JsonDocument,
				TList,
				TRequired
			>
		>,
	): DefaultedJsonField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedJsonFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			JsonDocument,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				JsonDocument,
				TList,
				TRequired
			>
		>,
	): NonDefaultedJsonField<TRequired, TList, TImmutable>
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
