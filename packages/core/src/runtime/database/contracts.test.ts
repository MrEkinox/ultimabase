import { ServiceRegistry } from '../../foundation.js'
import {
	Query,
	type CountOperationAst,
	type CreateOneOperationAst,
	type ExistsOperationAst,
	type FindOperationAst,
	type OperationKind,
	type QueryFilterNode,
	type UpdateExpression,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import { Schema, intField, stringField } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	databaseAdapterServiceToken,
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

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
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
	it('passes normalized operations and explicit access constraints to an adapter', async () => {
		const returnedArticles = [
			{ id: 'article-1', title: 'UltimaBase', views: 10 },
		]
		const adapter = new InMemoryAdapterFake({ find: returnedArticles })
		const operation = {
			kind: 'find',
			query: new Query(articleSchema).equalTo('views', 10).ast,
		} satisfies FindOperationAst<typeof articleSchema>
		const tenantConstraint = immutableRecord({
			kind: 'fixture-tenant',
			tenantId: 'tenant-1',
		})

		const result = await adapter.execute({
			accessConstraints: [tenantConstraint],
			operation,
		})

		expect(result).toBe(returnedArticles)
		expect(adapter.requests).toStrictEqual([
			{
				accessConstraints: [tenantConstraint],
				operation,
			},
		])
	})

	it('preserves scalar result semantics and transaction identity', async () => {
		const adapter = new InMemoryAdapterFake({ count: 3, exists: true })
		const query = new Query(articleSchema).ast
		const countOperation = {
			kind: 'count',
			query,
		} satisfies CountOperationAst<typeof articleSchema>
		const existsOperation = {
			kind: 'exists',
			query,
		} satisfies ExistsOperationAst<typeof articleSchema>

		await expect(
			adapter.execute({ accessConstraints: [], operation: countOperation }),
		).resolves.toBe(3)
		await expect(
			adapter.execute({ accessConstraints: [], operation: existsOperation }),
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
			schema: new Query(articleSchema).ast.schema,
		} satisfies CreateOneOperationAst<typeof articleSchema>
		const prepared = await transaction.prepare({
			accessConstraints: [],
			operation,
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

	it('registers one adapter through the application service token', () => {
		const adapter = new InMemoryAdapterFake({})
		const registry = new ServiceRegistry()

		registry.provide(databaseAdapterServiceToken, adapter)

		expect(registry.get(databaseAdapterServiceToken)).toBe(adapter)
	})
})
