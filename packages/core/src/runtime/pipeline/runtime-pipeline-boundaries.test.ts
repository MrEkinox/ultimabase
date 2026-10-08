import { FrameworkError } from '../../foundation.js'

import { describe, expect, it } from 'vitest'

import type {
	DatabaseAdapter,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import {
	databasePersistencePlanCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
} from '../database/contracts.js'

import { RuntimePipeline } from './runtime-pipeline.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'

import {
	articleOperation,
	articleSchema,
	createBehaviorStages,
	createEnforcementStages,
	createStages,
	relationPredicateOperation,
	requestContext,
	TraceDatabaseExecutor,
} from '../../../tests/fixtures/runtime-pipeline.js'

describe('RuntimePipeline boundaries', () => {
	it('enforces reads before observers and restricts the final result', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				behaviors: createBehaviorStages(trace),
				enforcement: createEnforcementStages(trace),
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleOperation,
		})

		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'enforcement:evaluate',
			'enforcement:operation',
			'behavior:beforeOperation',
			'databaseOperation',
			'enforcement:selection-result',
			'behavior:transformDatabaseResult',
			'behavior:transformResult',
			'enforcement:result',
			'commit',
			'behavior:postCommit',
		])
	})

	it('keeps a relation scope private while enforcing and forwarding it', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [], {
			relations: databaseRelationCapability,
		})
		const relation = {
			fieldPath: ['tags'],
			source: articleSchema,
			sourceObjectId: '0198f090-2a50-7000-8000-000000000070',
			target: articleSchema,
		} as const
		const enforcement = createEnforcementStages(trace)
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: {
					...enforcement,
					enforceRelationRead: (input) => {
						trace.push('enforcement:relation-read')
						expect(Object.isFrozen(input)).toBe(true)
						expect(input.relation).toBe(relation)
					},
				},
			}),
		)

		await pipeline.execute({
			context: requestContext,
			operation: articleOperation,
			relation,
		})

		expect(trace).toContain('enforcement:relation-read')
		expect(executor.requests).toHaveLength(1)
		expect(executor.requests[0]?.relation).toBe(relation)
	})

	it('fails closed when an adapter does not advertise relation support', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleOperation,
				relation: {
					fieldPath: ['tags'],
					source: articleSchema,
					sourceObjectId: '0198f090-2a50-7000-8000-000000000071',
					target: articleSchema,
				},
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation queries are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('fails closed when an adapter cannot compile relation predicates', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: createEnforcementStages(trace),
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: relationPredicateOperation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation filters are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('requires private target policy for every relation predicate leaf', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [], {
			relationPredicates: databaseRelationPredicateCapability,
		})
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: createEnforcementStages(trace),
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: relationPredicateOperation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			publicMessage: 'Relation filters are not available.',
		})
		expect(executor.requests).toStrictEqual([])
	})

	it('preserves framework errors and stops every later phase', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const denial = new FrameworkError(
			'PERMISSION_DENIED',
			'Fixture guard rejected the operation',
		)
		const enforcement = createEnforcementStages(trace)
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				enforcement: {
					...enforcement,
					evaluate: (input) => {
						trace.push('enforcement:deny')
						expect(input.operation).toBe(articleOperation)

						throw denial
					},
				},
			}),
		)

		const execution = pipeline.execute({
			context: requestContext,
			operation: articleOperation,
		})

		await expect(execution).rejects.toBe(denial)
		await expect(execution).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		expect(trace).toStrictEqual([
			'normalization',
			'structuralValidation',
			'enforcement:deny',
		])
		expect(executor.requests).toStrictEqual([])
	})

	it('rejects an invalid replacement from a product behavior', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [
			{
				createdAt: '2026-08-02T00:00:00.000Z',
				id: '0198f090-2a50-7000-8000-000000000040',
				title: 'Valid adapter result',
				updatedAt: '2026-08-02T00:00:00.000Z',
			},
		])
		const pipeline = new RuntimePipeline(
			createStages(trace, executor, {
				behaviors: {
					transformResult: () =>
						[
							// The final shared boundary protects malformed JavaScript behavior output.
							{},
						] as never,
				},
			}),
		)

		await expect(
			pipeline.execute({
				context: requestContext,
				operation: articleOperation,
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(trace).not.toContain('commit')
	})

	it('rejects an omitted mandatory stage during JavaScript assembly', () => {
		const trace: string[] = []
		const stages = createStages(trace, new TraceDatabaseExecutor(trace, []))

		for (const stageName of [
			'structuralValidation',
			'finalMutationValidation',
		] as const) {
			expect(
				() => new RuntimePipeline({ ...stages, [stageName]: undefined }),
			).toThrow(
				new TypeError(`Runtime pipeline stage ${stageName} must be a function`),
			)
		}
	})

	it('rejects malformed JavaScript pipeline assembly eagerly', () => {
		const trace: string[] = []
		const stages = createStages(trace, new TraceDatabaseExecutor(trace, []))

		expect(
			() =>
				// @ts-expect-error -- Runtime validation protects non-object assembly.
				new RuntimePipeline([]),
		).toThrow(new TypeError('Runtime pipeline stages must be a plain object'))

		for (const invalidExecutor of [undefined, null, {}, { execute: true }]) {
			expect(
				() =>
					new RuntimePipeline({
						...stages,
						// @ts-expect-error -- Runtime validation rejects forged executors.
						databaseOperation: invalidExecutor,
					}),
			).toThrow(
				new TypeError(
					'Runtime pipeline databaseOperation must be an operation executor',
				),
			)
		}
	})

	it('rejects malformed JavaScript execution requests before normalization', async () => {
		const trace: string[] = []
		const pipeline = new RuntimePipeline(
			createStages(trace, new TraceDatabaseExecutor(trace, [])),
		)

		await expect(
			// @ts-expect-error -- Runtime validation protects non-object requests.
			pipeline.execute(null),
		).rejects.toThrow(
			new TypeError('Runtime pipeline request must be a plain object'),
		)
		await expect(
			pipeline.execute({
				// @ts-expect-error -- Runtime validation rejects forged contexts.
				context: {},
				operation: articleOperation,
			}),
		).rejects.toThrow(
			new TypeError('Runtime pipeline context must be a RequestContext'),
		)
		expect(trace).toStrictEqual([])
	})

	it('requires a valid database adapter before opening a transaction', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const pipeline = new RuntimePipeline(createStages(trace, executor))

		await expect(pipeline.beginTransaction()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'database-adapter-required' },
		})

		const invalidAdapter = {
			kind: 'database-adapter' as const,
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			beginTransaction: (): Promise<null> => Promise.resolve(null),
		}
		const invalidTransactionPipeline = new RuntimePipeline(
			createStages(trace, invalidAdapter),
		)

		await expect(
			invalidTransactionPipeline.beginTransaction(),
		).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'invalid-transaction-adapter' },
		})
	})

	it('prevents a transaction scope from being finalized twice', async () => {
		const trace: string[] = []
		const executor = new TraceDatabaseExecutor(trace, [])
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> =>
				Promise.resolve(
					createPreparedOperationFixture({
						execute: () => executor.execute(request),
					}),
				),
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			commit: (): Promise<void> => Promise.resolve(),
			rollback: (): Promise<void> => Promise.resolve(),
		}
		const adapter: DatabaseAdapter = {
			kind: 'database-adapter',
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> =>
				executor.execute(request),
			beginTransaction: (): Promise<DatabaseTransactionAdapter> =>
				Promise.resolve(transaction),
		}
		const pipeline = new RuntimePipeline(createStages(trace, adapter))
		const committedScope = await pipeline.beginTransaction()

		await expect(committedScope.flushPostCommitEvents()).rejects.toThrow(
			new TypeError(
				'Runtime transaction events require a committed transaction',
			),
		)
		await committedScope.commit()
		await committedScope.flushPostCommitEvents()
		await expect(committedScope.commit()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)
		await expect(committedScope.rollback()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)

		const rolledBackScope = await pipeline.beginTransaction()

		await rolledBackScope.rollback()
		await expect(rolledBackScope.commit()).rejects.toThrow(
			new TypeError('Runtime transaction scope is already finalized'),
		)
	})
})
