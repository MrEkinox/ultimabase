import { RequestCapability } from '@ultimabase/access'
import { FrameworkApplication, FrameworkError } from '@ultimabase/core'
import { defineSchema, intField, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	getCurrentEngine,
	getCurrentRequest,
	requestSources,
	runWithRequestEngine,
	RuntimePipeline,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type RuntimePipelineStages,
} from '../src/index.js'

const articleSchema = defineSchema({
	className: 'TransactionArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField({ default: 0 }),
	},
})

interface FulfilledAdapterResult {
	readonly status: 'fulfilled'
	readonly value: unknown
}

interface RejectedAdapterResult {
	readonly status: 'rejected'
	readonly error: Error
}

type QueuedAdapterResult = FulfilledAdapterResult | RejectedAdapterResult

interface TransactionFailureOptions {
	readonly commit?: Error
	readonly rollback?: Error
}

/** Models one plugin-owned transaction and records every lifecycle boundary. */
class RecordingTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly requests: DatabaseOperationRequest[] = []
	readonly #results: QueuedAdapterResult[]
	readonly #trace: string[]
	readonly #failures: TransactionFailureOptions

	constructor(
		results: readonly QueuedAdapterResult[],
		trace: string[],
		failures: TransactionFailureOptions = {},
	) {
		this.#results = [...results]
		this.#trace = trace
		this.#failures = failures
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		this.#trace.push(`execute:${request.operation.kind}`)

		const result: QueuedAdapterResult | undefined = this.#results.shift()

		if (result === undefined) {
			return Promise.reject(new Error('Missing transaction fixture result'))
		}

		if (result.status === 'rejected') {
			return Promise.reject(result.error)
		}

		// The fixture value is paired with the exact operation at its call site.
		return Promise.resolve(result.value as DatabaseOperationResult<TOperation>)
	}

	commit(): Promise<void> {
		this.#trace.push('adapter:commit')

		return this.#failures.commit === undefined
			? Promise.resolve()
			: Promise.reject(this.#failures.commit)
	}

	rollback(): Promise<void> {
		this.#trace.push('adapter:rollback')

		return this.#failures.rollback === undefined
			? Promise.resolve()
			: Promise.reject(this.#failures.rollback)
	}
}

/** Starts a fresh transaction adapter for every independent request callback. */
class RecordingDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly rootRequests: DatabaseOperationRequest[] = []
	readonly transactions: RecordingTransactionAdapter[] = []
	readonly #results: readonly QueuedAdapterResult[]
	readonly #trace: string[]
	readonly #failures: TransactionFailureOptions

	constructor(
		results: readonly QueuedAdapterResult[],
		trace: string[],
		failures: TransactionFailureOptions = {},
	) {
		this.#results = results
		this.#trace = trace
		this.#failures = failures
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.rootRequests.push(request)

		return Promise.reject(new Error('Transaction bypassed its scoped adapter'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.#trace.push('adapter:begin')

		const transaction = new RecordingTransactionAdapter(
			this.#results,
			this.#trace,
			this.#failures,
		)

		this.transactions.push(transaction)

		return Promise.resolve(transaction)
	}
}

/** Creates the real pipeline while leaving unrelated capabilities neutral. */
const createPipeline = (
	databaseOperation: DatabaseAdapter,
	trace: string[],
): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		clp: () => undefined,
		acl: (input) => input.accessConstraints,
		fieldPermissions: (input) => ({
			operation: input.operation,
			accessConstraints: input.accessConstraints,
		}),
		globalBeforeHooks: (input) => input.operation,
		schemaBeforeHooks: (input) => input.operation,
		databaseOperation,
		schemaAfterHooks: (input) => input.result,
		globalAfterHooks: (input) => input.result,
		commit: (input) => {
			trace.push(`pipeline:commit:${input.operation.kind}`)
		},
		postCommitEvents: (input) => {
			trace.push(`event:${input.operation.kind}`)
		},
	}

	return new RuntimePipeline(stages)
}

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
		pipeline: createPipeline(adapter, trace),
	})
	const capability = new RequestCapability('article:write')
	const request = framework.user('user-1', {
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
		const created = { id: 'article-1', title: 'Created', views: 0 }
		const updated = { id: 'article-1', title: 'Created', views: 1 }
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

					const article = await transaction.query(articleSchema).create({
						title: 'Created',
					})

					await transaction
						.query(articleSchema)
						.equalTo('id', article.id)
						.updateOne({ increment: { views: 1 } })

					return article
				},
			)

			expect(getCurrentEngine()).toBe(request)

			return transactionResult
		})

		expect(result).toBe(created)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
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
		const created = { id: 'article-1', title: 'Deferred', views: 0 }
		const deferred = Promise.withResolvers<typeof created>()
		const { request } = createRequest(
			[{ status: 'fulfilled', value: deferred.promise }],
			trace,
		)

		const transactionPromise = request.transaction((transaction) => {
			void transaction.query(articleSchema).create({ title: 'Deferred' })

			return 'completed'
		})

		await expect.poll(() => trace).toContain('execute:create-one')
		expect(trace).not.toContain('adapter:commit')

		deferred.resolve(created)

		await expect(transactionPromise).resolves.toBe('completed')
		expect(trace).toStrictEqual([
			'adapter:begin',
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

		const transactionPromise = request.transaction(async (transaction) => {
			try {
				await transaction.query(articleSchema).create({ title: 'Rejected' })
			} catch (error: unknown) {
				expect(error).toBe(operationError)
			}

			return 'caught operation error'
		})

		await expect(transactionPromise).rejects.toBe(operationError)
		expect(trace).toStrictEqual([
			'adapter:begin',
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

		const transactionPromise = request.transaction((transaction) =>
			transaction.query(articleSchema).create({ title: 'Rejected' }),
		)

		await expect(transactionPromise).rejects.toBe(operationError)
		expect(trace).toStrictEqual([
			'adapter:begin',
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

	it('closes escaped engines and queries after their callback completes', async () => {
		const trace: string[] = []
		const { request } = createRequest([], trace)
		let escapedEngine: typeof request | undefined
		let escapedQuery: ReturnType<typeof request.query> | undefined

		await request.transaction((transaction) => {
			escapedEngine = transaction
			escapedQuery = transaction.query(articleSchema)
		})

		expect(() => escapedEngine?.query(articleSchema)).toThrow(
			new FrameworkError(
				'TRANSACTION_ERROR',
				'Transaction engine cannot be used after its callback has completed.',
				{
					publicMessage: 'The transaction is no longer active.',
					internalDetails: { reason: 'transaction-engine-closed' },
				},
			),
		)
		expect(() => escapedQuery?.count()).toThrow(
			expect.objectContaining({
				code: 'TRANSACTION_ERROR',
				internalDetails: { reason: 'transaction-engine-closed' },
			}),
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
