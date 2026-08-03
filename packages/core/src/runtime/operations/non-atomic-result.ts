import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	NonAtomicBulkResult,
	OperationAstNode,
} from '../../query/index.js'

/** Detects the two collection terminals whose adapter may commit a prefix. */
export const isNonAtomicBulkOperation = (
	operation: OperationAstNode,
): boolean => {
	const value: unknown = operation

	return (
		isPlainRecord(value) &&
		(value.kind === 'create-many' || value.kind === 'upsert-many') &&
		isPlainRecord(value.options) &&
		value.options.atomic === false
	)
}

/** Reads one already validated Runtime wrapper at internal transformation seams. */
export const readNonAtomicBulkResult = (
	value: unknown,
	path: string,
): NonAtomicBulkResult<unknown> => {
	if (
		!isPlainRecord(value) ||
		!isUnknownArray(value.results) ||
		(value.status !== 'completed' && value.status !== 'stopped')
	) {
		throw new TypeError(`${path} must be a non-atomic bulk result`)
	}

	if (value.status === 'completed') {
		return immutableRecord({
			results: immutableArray(value.results),
			status: 'completed',
		})
	}

	if (
		!Number.isSafeInteger(value.failedIndex) ||
		typeof value.failedIndex !== 'number' ||
		!Object.hasOwn(value, 'error')
	) {
		throw new TypeError(`${path} stopped result must describe its failure`)
	}

	return immutableRecord({
		error: value.error,
		failedIndex: value.failedIndex,
		results: immutableArray(value.results),
		status: 'stopped',
	})
}

/** Maps only the successful prefix while preserving completion metadata. */
export const mapNonAtomicBulkResult = <TResult>(
	value: unknown,
	path: string,
	map: (record: unknown, index: number) => TResult,
): NonAtomicBulkResult<TResult> => {
	const result = readNonAtomicBulkResult(value, path)
	const results = immutableArray(result.results.map(map))

	return result.status === 'completed'
		? immutableRecord({ results, status: 'completed' })
		: immutableRecord({
				error: result.error,
				failedIndex: result.failedIndex,
				results,
				status: 'stopped',
			})
}
