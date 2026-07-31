import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
import type { FieldDefinition, FieldOptions } from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
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

const normalizeJsonFieldOptions = <const TOptions extends JsonFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeFlatValidation, snapshotJsonValue)

/** Creates immutable JSON metadata with recursively detached static values. */
export const jsonField: ScalarFieldFactory<
	'json',
	JsonValue,
	JsonFieldOptions
> = createScalarFieldFactory(
	'json',
	normalizeJsonFieldOptions,
	snapshotJsonValue,
)
