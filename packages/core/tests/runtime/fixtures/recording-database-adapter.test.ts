import {
	createDatabasePersistencePlan,
	QueryBuilder,
} from '../../../src/index.js'
import type { DeleteOneOperationAst } from '../../../src/query/index.js'
import { describe, expect, it } from 'vitest'

import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './recording-database-adapter.js'
import { UltimaBase } from '../../../src/runtime/application/ultima-base.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'RecordingAdapterArticle',
	fields: (field) => ({ title: field.string() }),
})

const deleteOperation = {
	kind: 'delete-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', 'article-1'),
	).ast,
} satisfies DeleteOneOperationAst<typeof articleSchema>

/** Prepares one delete fixture through the same transaction boundary used by Runtime. */
const prepareDelete = async (result: QueuedAdapterResult, trace: string[]) => {
	const adapter = new RecordingDatabaseAdapter([result], trace)
	const transaction = await adapter.beginTransaction()
	const prepared = await transaction.prepare({
		constraints: [],
		operation: deleteOperation,
		plan: createDatabasePersistencePlan(deleteOperation),
	})

	return { adapter, prepared, transaction }
}

describe('RecordingDatabaseAdapter mutation fixtures', () => {
	it('exposes delete snapshots and executes one retained result exactly once', async () => {
		const trace: string[] = []
		const deleted = Object.freeze({ id: 'article-1', title: 'Deleted' })
		const { adapter, prepared, transaction } = await prepareDelete(
			{
				target: deleted,
				materializations: [{ kind: 'delete', previous: deleted }],
				status: 'fulfilled',
				value: deleted,
			},
			trace,
		)

		expect(prepared.target).toBe(deleted)
		expect(Object.isFrozen(prepared)).toBe(true)

		const outcome = await prepared.execute()

		expect(outcome).toStrictEqual({
			materializations: [{ kind: 'delete', previous: deleted }],
			result: deleted,
		})
		expect(Object.isFrozen(outcome)).toBe(true)
		expect(Object.isFrozen(outcome.materializations)).toBe(true)
		await expect(prepared.execute()).rejects.toThrow(
			'Prepared database operation is already executed',
		)
		expect(transaction.requests).toHaveLength(1)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:delete-one',
			'execute:delete-one',
		])
	})

	it('consumes a prepared handle after its first rejected execution', async () => {
		const trace: string[] = []
		const deletionError = new Error('delete failed')
		const deleted = Object.freeze({ id: 'article-1', title: 'Retained' })
		const { prepared } = await prepareDelete(
			{
				target: deleted,
				error: deletionError,
				status: 'rejected',
			},
			trace,
		)

		await expect(prepared.execute()).rejects.toBe(deletionError)
		await expect(prepared.execute()).rejects.toThrow(
			'Prepared database operation is already executed',
		)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:delete-one',
			'execute:delete-one',
		])
	})
})
