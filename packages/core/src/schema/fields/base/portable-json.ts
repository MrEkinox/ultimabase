import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { assertPlainObject } from '../../../exact-object-validation.js'

/** Represents values that have a lossless, portable JSON encoding. */
export type JsonPrimitive = boolean | null | number | string

export type JsonArray = readonly JsonValue[]

export interface JsonObject {
	readonly [key: string]: JsonValue
}

/** Represents the object or array container accepted at a JSON field root. */
export type JsonDocument = JsonArray | JsonObject

/** Represents every value accepted recursively inside a JSON document. */
export type JsonValue = JsonDocument | JsonPrimitive

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
			return immutableArray(
				value.map((item, index) =>
					normalizeJsonValue(item, `${path}[${String(index)}]`, ancestors),
				),
			)
		}

		assertPlainObject(value, `${path} must contain only plain JSON objects`)

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
