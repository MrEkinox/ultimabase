import { Buffer } from 'node:buffer'

import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { Pointer } from '../relations/pointer.js'

/** The JSON shape of a binary value: REST's base64 object (ADR-0310). */
export interface BinaryJSON {
	readonly type: 'binary'
	readonly encoding: 'base64'
	readonly data: string
}

/**
 * The JSON shape `toJSON` produces for a value: `bigint` becomes a decimal
 * string, binary a {@link BinaryJSON}, a `Pointer` its pointer JSON, and
 * objects and arrays are mapped recursively.
 */
export type JsonOf<TValue> = TValue extends bigint
	? string
	: TValue extends Uint8Array
		? BinaryJSON
		: TValue extends string | number | boolean | null
			? TValue
			: TValue extends { toJSON(): infer TJSON }
				? JsonOf<TJSON>
				: TValue extends readonly (infer TItem)[]
					? readonly JsonOf<TItem>[]
					: TValue extends object
						? { readonly [TKey in keyof TValue]: JsonOf<TValue[TKey]> }
						: never

const encode = (value: unknown, ancestors: WeakSet<object>): unknown => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return value
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError('toJSON received a non-finite number')
		}
		return value
	}
	if (typeof value === 'bigint') return value.toString(10)
	// `undefined`, functions and symbols have no JSON value in a REST response.
	if (typeof value !== 'object') {
		throw new TypeError(`toJSON received an unsupported ${typeof value}`)
	}
	if (value instanceof Uint8Array) {
		return immutableRecord({
			type: 'binary',
			encoding: 'base64',
			data: Buffer.from(value).toString('base64'),
		})
	}
	if (Pointer.is(value)) return value.toJSON()
	if (ancestors.has(value)) {
		throw new TypeError('toJSON received a circular value')
	}
	ancestors.add(value)
	try {
		if (isUnknownArray(value)) {
			return immutableArray(value.map((item) => encode(item, ancestors)))
		}
		if (isPlainRecord(value)) {
			// Entries keep every field name, including `__proto__`, as an own key.
			return immutableRecord(
				Object.fromEntries(
					Object.entries(value).map(([key, item]) => [
						key,
						encode(item, ancestors),
					]),
				),
			)
		}
		// Plugin values such as an ACL serialize themselves, like JSON.stringify.
		const toJSONMethod: unknown = Reflect.get(value, 'toJSON')
		if (typeof toJSONMethod === 'function') {
			return encode(Reflect.apply(toJSONMethod, value, []), ancestors)
		}
		throw new TypeError('toJSON received an unsupported object')
	} finally {
		ancestors.delete(value)
	}
}

/**
 * Serializes a result, a list of results or any value inside them exactly as
 * REST responses do (ADR-0310): `bigint` as a decimal string, binary as
 * `{ type: 'binary', encoding: 'base64', data }`, a `Pointer` as
 * `{ type: 'pointer', className, id }`, included rows and embedded objects
 * recursively. `JSON.stringify` on a raw result throws on `bigint`.
 *
 * @example `return Response.json(toJSON(todo))`
 */
export const toJSON = <const TValue>(value: TValue): JsonOf<TValue> =>
	// The encoder above produces exactly the shape `JsonOf` describes.
	encode(value, new WeakSet()) as JsonOf<TValue>
