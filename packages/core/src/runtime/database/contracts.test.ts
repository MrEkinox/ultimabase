import {
	QueryBuilder,
	type CountOperationAst,
	type CreateOneOperationAst,
	type ExistsOperationAst,
	type FindManyOperationAst,
	type OperationKind,
	type QueryFilterNode,
	type UpdateExpression,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { createDatabasePersistencePlan } from '../persistence/plans.js'

import {
	databaseInclusionCapability,
	databaseInclusionCapabilityVersion,
	databasePointerCapability,
	databasePointerCapabilityVersion,
	databaseRelationCapability,
	databaseRelationCapabilityVersion,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationOutcome,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from './contracts.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
		views: field.int(),
	}),
})

type FixtureResultByKind = Readonly<Partial<Record<OperationKind, unknown>>>

/** Implements only the contract surface needed to prove adapter substitutability. */
class InMemoryOperationExecutor implements DatabaseOperationExecutor {
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly results: FixtureResultByKind) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)

		// The test fixture supplies values by discriminant like a real database implementation.
		return Promise.resolve(
			this.results[
				request.operation.kind
			] as DatabaseOperationResult<TOperation>,
		)
	}
}

/** Models transaction lifecycle without becoming a reusable production adapter. */
class InMemoryTransactionFake
	extends InMemoryOperationExecutor
	implements DatabaseTransactionAdapter
{
	readonly kind = 'database-transaction-adapter' as const
	committed = false
	rolledBack = false

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		let attempted = false

		const prepared = {
			...(request.operation.kind === 'delete-one' ||
			request.operation.kind === 'update-one'
				? { target: null }
				: {}),
			execute: async (): Promise<DatabaseOperationOutcome<TOperation>> => {
				if (attempted) {
					throw new TypeError('Prepared database operation is already executed')
				}

				// Failed executions consume the handle so adapters cannot retarget retries.
				attempted = true

				const result = await this.execute(request)
				const outcome = {
					materializations:
						request.operation.kind === 'create-one'
							? [{ current: result, kind: 'create' as const }]
							: [],
					result,
				}

				// This generic fixture narrows its discriminant at runtime like an adapter.
				return outcome as unknown as DatabaseOperationOutcome<TOperation>
			},
		}

		return Promise.resolve(
			prepared as unknown as PreparedDatabaseOperation<TOperation>,
		)
	}

	commit(): Promise<void> {
		this.committed = true

		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.rolledBack = true

		return Promise.resolve()
	}
}

/** Proves the root adapter can create one distinguishable transaction executor. */
class InMemoryAdapterFake
	extends InMemoryOperationExecutor
	implements DatabaseAdapter
{
	readonly kind = 'database-adapter' as const
	transaction: InMemoryTransactionFake | undefined

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.transaction = new InMemoryTransactionFake({ count: 1 })

		return Promise.resolve(this.transaction)
	}
}

describe('database adapter contracts', () => {
	it('publishes one frozen versioned pointer capability for adapter reuse', () => {
		expect(databasePointerCapability).toStrictEqual({
			kind: 'pointers',
			version: databasePointerCapabilityVersion,
		})
		expect(Object.isFrozen(databasePointerCapability)).toBe(true)
	})

	it('publishes one frozen eager relationship-inclusion capability', () => {
		expect(databaseInclusionCapability).toStrictEqual({
			kind: 'inclusions',
			version: databaseInclusionCapabilityVersion,
		})
		expect(Object.isFrozen(databaseInclusionCapability)).toBe(true)
	})

	it('publishes one frozen versioned relation capability for adapter reuse', () => {
		expect(databaseRelationCapability).toStrictEqual({
			kind: 'relations',
			version: databaseRelationCapabilityVersion,
		})
		expect(Object.isFrozen(databaseRelationCapability)).toBe(true)
	})

	it('passes normalized operations and explicit constraints to an adapter', async () => {
		const returnedArticles = [
			{ id: 'article-1', title: 'UltimaBase', views: 10 },
		]
		const adapter = new InMemoryAdapterFake({ 'find-many': returnedArticles })
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('views', 10),
			).ast,
		} satisfies FindManyOperationAst<typeof articleSchema>
		const tenantConstraint = immutableRecord({
			kind: 'fixture.tenant',
			version: 1,
			payload: immutableRecord({ tenantId: 'tenant-1' }),
		})

		const plan = createDatabasePersistencePlan(operation)
		const result = await adapter.execute({
			constraints: [tenantConstraint],
			operation,
			plan,
		})

		expect(result).toBe(returnedArticles)
		expect(adapter.requests).toStrictEqual([
			{
				constraints: [tenantConstraint],
				operation,
				plan,
			},
		])
	})

	it('preserves scalar result semantics and transaction identity', async () => {
		const adapter = new InMemoryAdapterFake({ count: 3, exists: true })
		const query = new QueryBuilder(articleSchema).ast
		const countOperation = {
			kind: 'count',
			query,
		} satisfies CountOperationAst<typeof articleSchema>
		const existsOperation = {
			kind: 'exists',
			query,
		} satisfies ExistsOperationAst<typeof articleSchema>

		await expect(
			adapter.execute({
				constraints: [],
				operation: countOperation,
				plan: createDatabasePersistencePlan(countOperation),
			}),
		).resolves.toBe(3)
		await expect(
			adapter.execute({
				constraints: [],
				operation: existsOperation,
				plan: createDatabasePersistencePlan(existsOperation),
			}),
		).resolves.toBe(true)

		const transaction = await adapter.beginTransaction()

		expect(transaction.kind).toBe('database-transaction-adapter')
		expect(transaction).not.toHaveProperty('beginTransaction')
		await transaction.commit()
		expect(adapter.transaction?.committed).toBe(true)

		const rollbackAdapter = new InMemoryAdapterFake({})
		const rollbackTransaction = await rollbackAdapter.beginTransaction()

		await rollbackTransaction.rollback()
		expect(rollbackAdapter.transaction?.rolledBack).toBe(true)
	})

	it('prepares one single-use transaction outcome independently from its result', async () => {
		const createdArticle = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: 'article-1',
			title: 'Prepared',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		const transaction = new InMemoryTransactionFake({
			'create-one': createdArticle,
		})
		const operation = {
			input: { title: 'Prepared' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
		} satisfies CreateOneOperationAst<typeof articleSchema>
		const prepared = await transaction.prepare({
			constraints: [],
			operation,
			plan: createDatabasePersistencePlan(operation),
		})
		const outcome = await prepared.execute()

		expect(outcome).toStrictEqual({
			materializations: [{ current: createdArticle, kind: 'create' }],
			result: createdArticle,
		})
		await expect(prepared.execute()).rejects.toThrow(
			'Prepared database operation is already executed',
		)
	})

	it('keeps logical materializations separate from a selected public result', () => {
		const previous = Object.freeze({
			createdAt: '2026-08-02T00:00:00.000Z',
			id: 'article-1',
			title: 'Before',
			updatedAt: '2026-08-02T00:00:00.000Z',
			views: null,
		})
		const current = Object.freeze({
			...previous,
			title: 'After',
		})
		type SelectedUpdate = UpdateOneOperationAst<
			typeof articleSchema,
			UpdateExpression<typeof articleSchema>,
			QueryFilterNode<typeof articleSchema>,
			'id'
		>
		const outcome: DatabaseOperationOutcome<SelectedUpdate> = Object.freeze({
			result: Object.freeze({ id: 'article-1' }),
			materializations: Object.freeze([
				Object.freeze({ kind: 'update', previous, current }),
			] as const),
		})

		expect(outcome.result).toStrictEqual({ id: 'article-1' })
		expect(outcome.materializations).toStrictEqual([
			{ kind: 'update', previous, current },
		])
	})
})
