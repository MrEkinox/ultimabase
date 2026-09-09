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
	OutputKind,
	OutputValue,
} from './contracts.js'

type OutputElementSnapshot = (value: unknown, path: string) => unknown

interface OutputDescriptorCapability {
	readonly snapshotElement: OutputElementSnapshot
}

const outputDescriptorCapabilities = new WeakMap<
	object,
	OutputDescriptorCapability
>()

/** @internal Creates one provenance-checked immutable output descriptor. */
export const createOutputDescriptor = <
	TKind extends OutputKind,
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

	outputDescriptorCapabilities.set(descriptor, { snapshotElement })

	return descriptor
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
		!outputDescriptorCapabilities.has(value)
	) {
		throw new TypeError(`${path} must be created by OutputBuilder`)
	}
}

const snapshotNonNullOutputValue = (
	descriptor: GenericOutputDescriptor,
	value: unknown,
	path: string,
): unknown => {
	const capability = outputDescriptorCapabilities.get(descriptor)
	if (capability === undefined) {
		throw new TypeError(`${path} uses an invalid output descriptor`)
	}

	if (descriptor.options.list) {
		if (!isUnknownArray(value)) {
			throw new TypeError(`${path} must be a list`)
		}

		return immutableArray(
			value.map((item, index) => {
				const itemPath = `${path}[${String(index)}]`
				if (item === null) {
					throw new TypeError(`${itemPath} must not be null`)
				}

				return capability.snapshotElement(item, itemPath)
			}),
		)
	}

	return capability.snapshotElement(value, path)
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
		if (!descriptor.options.nullable) {
			throw new TypeError(`${path} must not be null`)
		}

		return null
	}

	return snapshotNonNullOutputValue(descriptor, value, path)
}
