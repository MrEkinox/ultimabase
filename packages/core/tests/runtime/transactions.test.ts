import { RequestCapability, increment } from '../../src/index.js'
import { FrameworkApplication, FrameworkError } from '../../src/index.js'
import { Schema, intField, stringField } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	getCurrentEngine,
	getCurrentRequest,
	requestSources,
	runWithRequestEngine,
} from '../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type TransactionFailureOptions,
} from './fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'TransactionArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField({ default: 0 }),
	},
})

const fixtureInstant = '2026-08-02T00:00:00.000Z'

/** Produces complete persisted records for transaction boundary fixtures. */
const articleRecord = (views: number, title: string) => ({
	createdAt: fixtureInstant,
	id: '0198f090-2a50-7000-8000-000000000020',
	title,
	updatedAt: fixtureInstant,
	views,
})

/** Binds one user request to an adapter-backed application fixture. */
const createRequest = (
	results: readonly QueuedAdapterResult[],
	trace: string[],
	failures: TransactionFailureOptions = {},
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace, failures)
	const framework = new FrameworkEngine({
		application: new FrameworkApplication({
			schemas: [articleSchema],
			plugins: [],
		}),
		pipeline: createRecordingPipeline(adapter, trace),
	})
	const capability = new RequestCapability('article:write')
	const request = framework.anonymous({
		requestId: 'transaction-1',
		source: requestSources.internal,
		capabilities: [capability],
		metadata: { traceId: 'trace-1' },
	})

	return { adapter, request }
}

describe('RequestEngine transactions', () => {
	it('commits once and exposes post-commit effects only after the adapter commit', async () => {
		const trace: string[] = []
		const created = articleRecord(0, 'Created')
		const updated = articleRecord(1, 'Created')
		const { adapter, request } = createRequest(
			[
				{ status: 'fulfilled', value: created },
				{ status: 'fulfilled', value: updated },
			],
			trace,
		)

		const result = await runWithRequestEngine(request, async () => {
			expect(getCurrentEngine()).toBe(request)

			const transactionResult = await request.transaction(
				async (transaction) => {
					expect(transaction).not.toBe(request)
					expect(transaction.context).toBe(request.context)
					expect(transaction.framework).toBe(request.framework)
					expect(transaction.context.capabilities).toBe(
						request.context.capabilities,
					)
					expect(transaction.context.metadata).toBe(request.context.metadata)
					expect(getCurrentEngine()).toBe(transaction)
					expect(getCurrentRequest()).toBe(request.context)

					const article = await articleSchema.create({
						title: 'Created',
					})

					await articleSchema.updateOne({
						where: (where) => where.equalTo('id', article.id),
						data: { views: increment(1) },
					})

					return article
				},
			)

			expect(getCurrentEngine()).toBe(request)

			return transactionResult
		})

		expect(result).toBeInstanceOf(articleSchema)
		expect(result.toJSON()).toStrictEqual(created)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:update-one',
			'execute:update-one',
			'adapter:commit',
			'event:create-one',
			'event:update-one',
		])
	})

	it('rolls back and preserves the exact error thrown by the callback', async () => {
		const trace: string[] = []
		const callbackError = new Error('business rule failed')
		const { request } = createRequest([], trace)

		const transactionPromise = request.transaction(() => {
			throw callbackError
		})

		await expect(transactionPromise).rejects.toBe(callbackError)
		expect(trace).toStrictEqual(['adapter:begin', 'adapter:rollback'])
	})

	it('waits for operations started inside the callback before committing', async () => {
		const trace: string[] = []
		const created = articleRecord(0, 'Deferred')
		const deferred = Promise.withResolvers<typeof created>()
		const { request } = createRequest(
			[{ status: 'fulfilled', value: deferred.promise }],
			trace,
		)

		const transactionPromise = request.transaction(() => {
			void articleSchema.create({ title: 'Deferred' })

			return 'completed'
		})

		await expect.poll(() => trace).toContain('execute:create-one')
		expect(trace).not.toContain('adapter:commit')

		deferred.resolve(created)

		await expect(transactionPromise).resolves.toBe('completed')
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:create-one',
		])
	})

	it('rolls back when an operation fails even if its rejection is caught', async () => {
		const trace: string[] = []
		const operationError = new Error('write failed')
		const { request } = createRequest(
			[{ status: 'rejected', error: operationError }],
			trace,
		)

		const transactionPromise = request.transaction(async () => {
			try {
				await articleSchema.create({ title: 'Rejected' })
			} catch (error: unknown) {
				expect(error).toBe(operationError)
			}

			return 'caught operation error'
		})

		await expect(transactionPromise).rejects.toBe(operationError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('does not duplicate one awaited operation failure during cleanup', async () => {
		const trace: string[] = []
		const operationError = new Error('awaited write failed')
		const { request } = createRequest(
			[{ status: 'rejected', error: operationError }],
			trace,
		)

		const transactionPromise = request.transaction(() =>
			articleSchema.create({ title: 'Rejected' }),
		)

		await expect(transactionPromise).rejects.toBe(operationError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('rejects nested transactions even when the callback catches the violation', async () => {
		const trace: string[] = []
		const { request } = createRequest([], trace)

		const transactionPromise = request.transaction(async (transaction) => {
			try {
				await transaction.transaction(() => undefined)
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(FrameworkError)
			}

			return 'ignored nested error'
		})

		await expect(transactionPromise).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'nested-transaction' },
		})
		expect(trace).toStrictEqual(['adapter:begin', 'adapter:rollback'])
	})

	it('closes escaped engines while keeping Query branches context-free', async () => {
		const trace: string[] = []
		const { request } = createRequest([], trace)
		let escapedEngine: typeof request | undefined
		let escapedQuery: ReturnType<typeof articleSchema.query> | undefined

		await request.transaction((transaction) => {
			escapedEngine = transaction
			escapedQuery = articleSchema.query()
		})

		await expect(
			escapedEngine?.execute({
				kind: 'count',
				query: articleSchema.query().ast,
			}),
		).rejects.toStrictEqual(
			expect.objectContaining({
				code: 'TRANSACTION_ERROR',
				internalDetails: { reason: 'transaction-engine-closed' },
			}),
		)
		expect(() => escapedQuery?.count()).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)
		expect(trace).toStrictEqual(['adapter:begin', 'adapter:commit'])
	})

	it('rolls back adapter commit failures without hiding their identity', async () => {
		const trace: string[] = []
		const commitError = new Error('commit failed')
		const { request } = createRequest([], trace, { commit: commitError })

		await expect(request.transaction(() => 'result')).rejects.toBe(commitError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'adapter:commit',
			'adapter:rollback',
		])
	})

	it('reports rollback failures without hiding the original callback error', async () => {
		const trace: string[] = []
		const callbackError = new Error('callback failed')
		const rollbackError = new Error('rollback failed')
		const { request } = createRequest([], trace, { rollback: rollbackError })

		const transactionPromise = request.transaction(() => {
			throw callbackError
		})

		await expect(transactionPromise).rejects.toEqual(
			new AggregateError(
				[callbackError, rollbackError],
				'Transaction failed and rollback reported an additional error.',
				{ cause: rollbackError },
			),
		)
	})
})
