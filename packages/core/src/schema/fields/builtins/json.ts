import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	fieldOptionKeys,
	fieldValidationOptionKeys,
	normalizeFieldOptions,
	normalizeFlatValidation,
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

/**
 * Represents values that have a lossless, portable JSON encoding.
 */
export type JsonPrimitive = boolean | null | number | string

export type JsonArray = readonly JsonValue[]

export interface JsonObject {
	readonly [key: string]: JsonValue
}

/** Represents the object or array container accepted at a JSON field root. */
export type JsonDocument = JsonArray | JsonObject

/** Represents every value accepted recursively inside a JSON document. */
export type JsonValue = JsonDocument | JsonPrimitive

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
	validationOptionKeys: fieldValidationOptionKeys,
}

/** Provides JSON-specific names for the shared compact scalar contract. */
type DefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedJsonFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonDocument,
	TRequired,
	TList,
	TImmutable
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
	>(
		options: DefaultedJsonFieldOptions<TRequired, TList, TImmutable>,
	): DefaultedJsonField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedJsonFieldOptions<TRequired, TList, TImmutable>,
	): NonDefaultedJsonField<TRequired, TList, TImmutable>
}

const normalizeJsonValue = (
	value: unknown,
	path: string,
	ancestors: WeakSet<object>,
): JsonValue => {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string'
	) {
		return value
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError(`${path} must contain only finite JSON numbers`)
		}

		return value
	}

	if (typeof value !== 'object') {
		throw new TypeError(`${path} must be a JSON value`)
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${path} must not contain circular references`)
	}

	ancestors.add(value)

	try {
		if (Array.isArray(value)) {
			const normalized: JsonValue[] = value.map((item, index) =>
				normalizeJsonValue(item, `${path}[${String(index)}]`, ancestors),
			)

			return immutableArray(normalized)
		}

		if (!isPlainRecord(value)) {
			throw new TypeError(`${path} must contain only plain JSON objects`)
		}

		const entries: [string, JsonValue][] = Object.entries(value).map(
			([key, item]) => [
				key,
				normalizeJsonValue(item, `${path}.${key}`, ancestors),
			],
		)

		return immutableRecord(Object.fromEntries(entries))
	} finally {
		ancestors.delete(value)
	}
}

/** Copies one recursive JSON value at trusted framework boundaries. */
export const snapshotJsonValue = (value: unknown, path: string): JsonValue =>
	normalizeJsonValue(value, path, new WeakSet<object>())

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
	normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		snapshotJsonDocument,
		jsonFieldOptionsContract,
	)

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
