import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { Pointer } from '../relations/pointer.js'
import type { SchemaDefinition } from '../schema/definition.js'
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

/** Throws the path-prefixed TypeError shared by every nested-write input failure. */
export function failNestedWriteInput(
	path: NestedWriteInputPath,
	problem: string,
): never {
	throw new TypeError(`${formatNestedWriteInputPath(path)} ${problem}`)
}

/** Rejects getters, hidden properties, and symbols before reading input values. */
export const assertInertNestedWriteRecord = (
	value: unknown,
	path: NestedWriteInputPath,
): InertNestedWriteRecord => {
	if (!isPlainRecord(value)) {
		return failNestedWriteInput(path, 'must be a plain object')
	}

	if (Object.getOwnPropertySymbols(value).length > 0) {
		failNestedWriteInput(path, 'cannot contain symbol keys')
	}

	for (const [key, descriptor] of Object.entries(
		Object.getOwnPropertyDescriptors(value),
	)) {
		if (!descriptor.enumerable || !('value' in descriptor)) {
			failNestedWriteInput([...path, key], 'must be an inert enumerable value')
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
		return failNestedWriteInput(
			path,
			`must be ${allowEmpty ? 'an' : 'a non-empty'} array`,
		)
	}

	for (let index = 0; index < value.length; index += 1) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
		if (descriptor === undefined || !('value' in descriptor)) {
			failNestedWriteInput([...path, index], 'must be an inert array item')
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
		return failNestedWriteInput(path, 'cannot contain a callback')
	}

	const isArray = Array.isArray(value)
	if (!isArray && !isPlainRecord(value)) return value

	// The active set tracks only the current branch, so shared acyclic values remain legal.
	if (active.has(value)) failNestedWriteInput(path, 'contains cyclic input')
	active.add(value)
	const snapshot = isArray
		? immutableArray(
				assertInertNestedWriteArray(value, path, true).map((item, index) =>
					snapshotNestedWriteInputValue(item, [...path, index], active),
				),
			)
		: immutableRecord(
				Object.fromEntries(
					Object.entries(assertInertNestedWriteRecord(value, path)).map(
						([key, item]) => [
							key,
							snapshotNestedWriteInputValue(item, [...path, key], active),
						],
					),
				),
			)
	active.delete(value)
	return snapshot
}

/** Reads one canonical non-empty object identifier. */
export const readNestedWriteId = (
	value: unknown,
	path: NestedWriteInputPath,
): string =>
	typeof value === 'string' && value.length > 0
		? value
		: failNestedWriteInput(path, 'must be a non-empty object ID')

/**
 * Reads one link target (ADR-0308): an object id or a Pointer of the declared
 * target schema; another schema's Pointer names the expected target.
 */
export const readNestedWriteTarget = (
	value: unknown,
	target: SchemaDefinition,
	path: NestedWriteInputPath,
): string => {
	if (!Pointer.is(value)) return readNestedWriteId(value, path)
	if (value.schema !== target) {
		failNestedWriteInput(
			path,
			`must be a ${target.className} Pointer or object ID`,
		)
	}
	return value.id
}

/** Reads one duplicate-free list of link targets. */
export const readNestedWriteTargets = (
	value: unknown,
	target: SchemaDefinition,
	path: NestedWriteInputPath,
	allowEmpty: boolean,
): readonly string[] => {
	const ids = assertInertNestedWriteArray(value, path, allowEmpty).map(
		(item, index) => readNestedWriteTarget(item, target, [...path, index]),
	)

	if (new Set(ids).size !== ids.length) {
		failNestedWriteInput(path, 'contains duplicate object IDs')
	}

	return immutableArray(ids)
}
