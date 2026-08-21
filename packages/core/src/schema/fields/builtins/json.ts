import {
	fieldOptionKeys,
	normalizeFieldOptions,
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
import { snapshotJsonValue, type JsonDocument } from '../base/portable-json.js'
import type { FieldStandardSchema } from '../base/standard-schema.js'

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

const jsonFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'json',
	optionKeys: fieldOptionKeys,
}

/** Provides JSON-specific names for the shared compact scalar contract. */
type DefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type NonDefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
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
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<TRequired, TList, TImmutable, true>

type NonDefaultedJsonField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<TRequired, TList, TImmutable, false>

interface JsonFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedJsonFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedJsonField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedJsonFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
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

const normalizeJsonFieldOptions = <const TOptions extends JsonFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, snapshotJsonDocument, jsonFieldOptionsContract)

/**
 * Declares an unstructured JSON object or array containing portable JSON values.
 *
 * @example
 * ```ts
 * jsonField({ default: { theme: "dark", notifications: true } })
 * ```
 */
export const jsonField: JsonFieldFactory = createCompactScalarFieldFactory<
	'json',
	JsonDocument,
	JsonFieldOptions
>('json', normalizeJsonFieldOptions, snapshotJsonDocument)
