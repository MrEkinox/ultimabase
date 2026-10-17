import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	GenericOutputDescriptor,
	NormalizedOutputValueOptions,
	OutputDescriptor,
	OutputValue,
	OutputValueShape,
} from './contracts.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../fields/base/kinds.js'

type OutputElementSnapshot = (value: unknown, path: string) => unknown

// Only descriptors registered here are genuine; the element snapshot stays private.
const outputElementSnapshots = new WeakMap<object, OutputElementSnapshot>()

/** @internal Creates one provenance-checked immutable output descriptor. */
export const createOutputDescriptor = <
	TKind extends string,
	TValue,
	TOptions extends NormalizedOutputValueOptions,
>(
	kind: TKind,
	options: TOptions,
	snapshotElement: OutputElementSnapshot,
): OutputDescriptor<TKind, TValue, TOptions> => {
	const descriptor = immutableRecord({
		kind,
		options,
	}) as unknown as OutputDescriptor<TKind, TValue, TOptions>

	outputElementSnapshots.set(descriptor, snapshotElement)

	return descriptor
}

/**
 * Creates one plugin-owned output value contract without granting stored-field behavior.
 *
 * The kind remains namespaced, the normalized common options are snapshotted, and
 * the element snapshot is retained behind Core's descriptor provenance boundary.
 */
export const definePluginOutputDescriptor = <
	const TKind extends string,
	TElement,
	const TOptions extends NormalizedOutputValueOptions,
>(
	kind: AvailablePluginFieldKind<TKind>,
	options: TOptions,
	snapshotElement: (value: unknown, path: string) => TElement,
): OutputDescriptor<
	TKind,
	OutputValueShape<TElement, TOptions['required'], TOptions['list']>,
	TOptions
> => {
	assertPluginFieldKind(kind, 'Plugin output descriptor kind')
	const fail = (problem: string): never => {
		throw new TypeError(`Plugin output descriptor ${problem}`)
	}
	if (!isPlainRecord(options)) return fail('options must be a plain object')
	if (typeof options.list !== 'boolean') fail('options.list must be a boolean')
	if (typeof options.required !== 'boolean') {
		fail('options.required must be a boolean')
	}
	if (
		options.description !== undefined &&
		typeof options.description !== 'string'
	) {
		fail('options.description must be a string')
	}
	if (typeof snapshotElement !== 'function') {
		fail('snapshotElement must be a function')
	}

	return createOutputDescriptor<
		TKind,
		OutputValueShape<TElement, TOptions['required'], TOptions['list']>,
		TOptions
	>(kind, immutableRecord({ ...options }), snapshotElement)
}

/** Protects virtual declarations and transports from forged descriptor objects. */
export function assertOutputDescriptor(
	value: unknown,
	path: string,
): asserts value is GenericOutputDescriptor {
	if (
		!isPlainRecord(value) ||
		typeof value.kind !== 'string' ||
		!isPlainRecord(value.options) ||
		!outputElementSnapshots.has(value)
	) {
		throw new TypeError(`${path} must be created by OutputBuilder`)
	}
}

/**
 * Validates, detaches, and freezes one value through its output-only contract.
 *
 * @example `snapshotOutputValue(descriptor, result, 'User.displayName')`
 */
export const snapshotOutputValue = <
	const TOutput extends GenericOutputDescriptor,
>(
	descriptor: TOutput,
	value: unknown,
	path: string,
): OutputValue<TOutput> => {
	assertOutputDescriptor(descriptor, path)

	if (value === undefined) {
		throw new TypeError(`${path} must not be undefined`)
	}

	if (value === null) {
		if (descriptor.options.required) {
			throw new TypeError(`${path} must not be null`)
		}

		return null
	}

	const snapshotElement = outputElementSnapshots.get(descriptor)
	if (snapshotElement === undefined) {
		throw new TypeError(`${path} uses an invalid output descriptor`)
	}

	if (!descriptor.options.list) return snapshotElement(value, path)
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be a list`)
	}

	// Nullability applies to the whole list; list items are never null.
	return immutableArray(
		value.map((item, index) => {
			const itemPath = `${path}[${String(index)}]`
			if (item === null) {
				throw new TypeError(`${itemPath} must not be null`)
			}

			return snapshotElement(item, itemPath)
		}),
	)
}
