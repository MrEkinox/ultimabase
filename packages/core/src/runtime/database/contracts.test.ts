import { ServiceRegistry } from '../../foundation.js'
import {
	Query,
	type CountOperationAst,
	type ExistsOperationAst,
	type FindOperationAst,
	type OperationKind,
} from '../../query/index.js'
import { Schema, intField, stringField } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
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

	it('registers one adapter through the application service token', () => {
		const adapter = new InMemoryAdapterFake({})
		const registry = new ServiceRegistry()

		registry.provide(databaseAdapterServiceToken, adapter)

		expect(registry.get(databaseAdapterServiceToken)).toBe(adapter)
	})
})
