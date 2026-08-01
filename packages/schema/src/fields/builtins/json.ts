import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
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

/**
 * Represents values that have a lossless, portable JSON encoding.
 */
export type JsonPrimitive = boolean | null | number | string

export type JsonArray = readonly JsonValue[]

export interface JsonObject {
	readonly [key: string]: JsonValue
}

export type JsonValue = JsonArray | JsonObject | JsonPrimitive

/**
 * Describes unstructured JSON metadata without exposing an unsafe value type.
 */
export type JsonFieldOptions = FieldOptions<JsonValue>

/**
 * Carries the portable JSON value contract through schema inference.
 */
export type JsonField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'json', JsonValue, JsonFieldOptions, TInference>

/** Provides JSON-specific names for the shared compact scalar contract. */
type DefaultedJsonFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	JsonValue,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type NonDefaultedJsonFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	JsonFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type ResolvedJsonField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'json',
	JsonValue,
	JsonFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedJsonField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<TRequired, TNullable, TList, TImmutable, true>

type NonDefaultedJsonField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedJsonField<TRequired, TNullable, TList, TImmutable, false>

interface JsonFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedJsonFieldOptions<TRequired, TNullable, TList, TImmutable>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): DefaultedJsonField<TRequired, TNullable, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedJsonFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): NonDefaultedJsonField<TRequired, TNullable, TList, TImmutable>
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

/**
 * Exposes the JSON snapshot boundary to structured object defaults.
 */
export const snapshotJsonValue = (value: unknown, path: string): JsonValue =>
	normalizeJsonValue(value, path, new WeakSet<object>())

const normalizeJsonFieldOptions = <const TOptions extends JsonFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeFlatValidation, snapshotJsonValue)

/**
 * Declares unstructured, portable JSON containing only objects, arrays, and JSON primitives.
 *
 * @example
 * ```ts
 * jsonField({ default: { theme: "dark", notifications: true } })
 * ```
 */
export const jsonField: JsonFieldFactory = createCompactScalarFieldFactory<
	'json',
	JsonValue,
	JsonFieldOptions
>('json', normalizeJsonFieldOptions, snapshotJsonValue)
