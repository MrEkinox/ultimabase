import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	emptyFieldOptions,
	normalizeFieldOptions,
	normalizeFlatValidation,
	type EmptyFieldOptions,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	ValidatedFieldOptions,
} from './field.js'
import { isPlainRecord } from './runtime-value.js'

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
export type JsonField<TOptions extends JsonFieldOptions = JsonFieldOptions> =
	FieldDefinition<'json', JsonValue, TOptions>

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

const normalizeJsonFieldOptions = (
	options: JsonFieldOptions,
): Readonly<JsonFieldOptions> =>
	normalizeFieldOptions(options, normalizeFlatValidation, snapshotJsonValue)

/**
 * Creates an optional, non-null JSON field with no additional metadata.
 */
export function jsonField(): JsonField<EmptyFieldOptions>

/**
 * Creates immutable JSON metadata while preserving every option literal.
 */
export function jsonField<const TOptions extends JsonFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, JsonValue> extends never
			? never
			: unknown),
): JsonField<TOptions>

export function jsonField(
	options: JsonFieldOptions = emptyFieldOptions,
): JsonField {
	return immutableRecord({
		kind: 'json',
		options: normalizeJsonFieldOptions(options),
	})
}
