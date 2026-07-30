import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './field-options.js'
import type { FieldDefinition, FieldOptions } from './field.js'

type EmptyJsonFieldOptions = Readonly<Record<PropertyKey, never>>

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

const emptyJsonFieldOptions: EmptyJsonFieldOptions = immutableRecord({})

const isJsonObject = (value: object): value is Record<string, unknown> => {
	const prototype: object | null = Reflect.getPrototypeOf(value)

	return prototype === null || prototype === Object.prototype
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

		if (!isJsonObject(value)) {
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

const normalizeJsonFieldOptions = (
	options: JsonFieldOptions,
): Readonly<JsonFieldOptions> => {
	const normalized = normalizeFieldOptions(options, normalizeFlatValidation)

	if (normalized.default === undefined) {
		return normalized
	}

	// JSON defaults cross a serialization boundary, so normalize them eagerly.
	return immutableRecord({
		...normalized,
		default: normalizeJsonValue(
			normalized.default,
			'default',
			new WeakSet<object>(),
		),
	})
}

/**
 * Creates an optional, non-null JSON field with no additional metadata.
 */
export function jsonField(): JsonField<EmptyJsonFieldOptions>

/**
 * Creates immutable JSON metadata while preserving every option literal.
 */
export function jsonField<const TOptions extends JsonFieldOptions>(
	options: TOptions,
): JsonField<TOptions>

export function jsonField(
	options: JsonFieldOptions = emptyJsonFieldOptions,
): JsonField {
	return immutableRecord({
		kind: 'json',
		options: normalizeJsonFieldOptions(options),
	})
}
