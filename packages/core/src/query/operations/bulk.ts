import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { AtomicBulkOperationOptions } from './contracts.js'

/** Lets callers opt out while keeping all ordered bulk writes atomic by default. */
export interface BulkOperationOptions {
	readonly atomic?: boolean
}

const atomicBulkOptions: AtomicBulkOperationOptions = immutableRecord({
	atomic: true,
})

const nonAtomicBulkOptions: AtomicBulkOperationOptions = immutableRecord({
	atomic: false,
})

/** Converts the optional public input into the closed operation-level contract. */
export const normalizeBulkOperationOptions = (
	options: BulkOperationOptions | undefined,
): AtomicBulkOperationOptions => {
	if (options === undefined) {
		return atomicBulkOptions
	}

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('bulk operation options must be an object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (key !== 'atomic') {
			throw new TypeError(`bulk operation options contain unknown key: ${key}`)
		}
	}

	if (
		untrustedOptions.atomic !== undefined &&
		typeof untrustedOptions.atomic !== 'boolean'
	) {
		throw new TypeError('bulk operation atomic option must be a boolean')
	}

	return untrustedOptions.atomic === false
		? nonAtomicBulkOptions
		: atomicBulkOptions
}

/** Snapshots caller-owned collection topology before asynchronous execution starts. */
export const snapshotCreateInputs = <const TInput>(
	inputs: readonly TInput[],
): readonly TInput[] => {
	const untrustedInputs: unknown = inputs

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('bulk create inputs must be an array')
	}

	return immutableArray(inputs)
}
