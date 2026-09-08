import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { NestedWriteInputPath } from './contracts.js'

/** Represents one plain callback-free input record during graph normalization. */
export type InertNestedWriteRecord = Readonly<Record<string, unknown>>

export const formatNestedWriteInputPath = (
	path: NestedWriteInputPath,
): string =>
	path.reduce<string>(
		(result, segment) =>
			typeof segment === 'number'
				? `${result}[${String(segment)}]`
				: result === ''
					? segment
					: `${result}.${segment}`,
		'',
	)

/** Rejects getters, hidden properties, and symbols before reading input values. */
export const assertInertNestedWriteRecord = (
	value: unknown,
	path: NestedWriteInputPath,
): InertNestedWriteRecord => {
	if (!isPlainRecord(value)) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} must be a plain object`,
		)
	}

	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} cannot contain symbol keys`,
		)
	}

	for (const [key, descriptor] of Object.entries(
		Object.getOwnPropertyDescriptors(value),
	)) {
		if (!descriptor.enumerable || !('value' in descriptor)) {
			throw new TypeError(
				`${formatNestedWriteInputPath([...path, key])} must be an inert enumerable value`,
			)
		}
	}

	return value
}

/** Rejects sparse or accessor-backed arrays before reading input items. */
export const assertInertNestedWriteArray = (
	value: unknown,
	path: NestedWriteInputPath,
	allowEmpty: boolean,
): readonly unknown[] => {
	if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} must be ${allowEmpty ? 'an' : 'a non-empty'} array`,
		)
	}

	for (let index = 0; index < value.length; index += 1) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
		if (descriptor === undefined || !('value' in descriptor)) {
			throw new TypeError(
				`${formatNestedWriteInputPath([...path, index])} must be an inert array item`,
			)
		}
	}

	return value
}

/** Detaches ordinary scalar and embedded input without executing accessors. */
export const snapshotNestedWriteInputValue = (
	value: unknown,
	path: NestedWriteInputPath,
	active: WeakSet<object> = new WeakSet(),
): unknown => {
	if (typeof value === 'function') {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} cannot contain a callback`,
		)
	}

	if (Array.isArray(value)) {
		if (active.has(value)) {
			throw new TypeError(
				`${formatNestedWriteInputPath(path)} contains cyclic input`,
			)
		}
		active.add(value)
		const input = assertInertNestedWriteArray(value, path, true)
		const result = immutableArray(
			input.map((item, index) =>
				snapshotNestedWriteInputValue(item, [...path, index], active),
			),
		)
		active.delete(value)
		return result
	}

	if (isPlainRecord(value)) {
		if (active.has(value)) {
			throw new TypeError(
				`${formatNestedWriteInputPath(path)} contains cyclic input`,
			)
		}
		active.add(value)
		const input = assertInertNestedWriteRecord(value, path)
		const result = immutableRecord(
			Object.fromEntries(
				Object.entries(input).map(([key, item]) => [
					key,
					snapshotNestedWriteInputValue(item, [...path, key], active),
				]),
			),
		)
		active.delete(value)
		return result
	}

	return value
}

/** Reads one canonical non-empty object identifier. */
export const readNestedWriteId = (
	value: unknown,
	path: NestedWriteInputPath,
): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} must be a non-empty object ID`,
		)
	}

	return value
}

/** Reads one duplicate-free canonical identifier list. */
export const readNestedWriteIds = (
	value: unknown,
	path: NestedWriteInputPath,
	allowEmpty: boolean,
): readonly string[] => {
	const input = assertInertNestedWriteArray(value, path, allowEmpty)
	const ids = input.map((item, index) =>
		readNestedWriteId(item, [...path, index]),
	)

	if (new Set(ids).size !== ids.length) {
		throw new TypeError(
			`${formatNestedWriteInputPath(path)} contains duplicate object IDs`,
		)
	}

	return immutableArray(ids)
}
