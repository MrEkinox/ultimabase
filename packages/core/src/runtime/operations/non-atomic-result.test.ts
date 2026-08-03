import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	isNonAtomicBulkOperation,
	mapNonAtomicBulkResult,
	readNonAtomicBulkResult,
} from './non-atomic-result.js'

describe('non-atomic Runtime results', () => {
	it('detects only supported collection operations with atomic false', () => {
		const nonAtomicCreate = immutableRecord({
			kind: 'create-many',
			options: immutableRecord({ atomic: false }),
		})
		const nonAtomicUpsert = immutableRecord({
			kind: 'upsert-many',
			options: immutableRecord({ atomic: false }),
		})
		const atomicCreate = immutableRecord({
			kind: 'create-many',
			options: immutableRecord({ atomic: true }),
		})

		expect(isNonAtomicBulkOperation(nonAtomicCreate)).toBe(true)
		expect(isNonAtomicBulkOperation(nonAtomicUpsert)).toBe(true)
		expect(isNonAtomicBulkOperation(atomicCreate)).toBe(false)
		expect(isNonAtomicBulkOperation({ kind: 'find' })).toBe(false)
	})

	it('maps successful records without losing stopped metadata', () => {
		const writeError = new Error('second input failed')
		const completed = mapNonAtomicBulkResult(
			{ results: [{ value: 1 }], status: 'completed' },
			'Fixture result',
			(record) => immutableRecord({ record }),
		)
		const stopped = mapNonAtomicBulkResult(
			{
				error: writeError,
				failedIndex: 1,
				results: [{ value: 1 }],
				status: 'stopped',
			},
			'Fixture result',
			(record) => immutableRecord({ record }),
		)

		expect(completed).toStrictEqual({
			results: [{ record: { value: 1 } }],
			status: 'completed',
		})
		expect(stopped).toStrictEqual({
			error: writeError,
			failedIndex: 1,
			results: [{ record: { value: 1 } }],
			status: 'stopped',
		})
		expect(Object.isFrozen(stopped.results)).toBe(true)
	})

	it('rejects malformed internal wrappers before transforming them', () => {
		expect(() => readNonAtomicBulkResult([], 'Fixture result')).toThrow(
			'Fixture result must be a non-atomic bulk result',
		)
		expect(() =>
			readNonAtomicBulkResult(
				{ failedIndex: 0, results: [], status: 'stopped' },
				'Fixture result',
			),
		).toThrow('Fixture result stopped result must describe its failure')
	})
})
