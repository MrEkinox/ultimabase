import {
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

export const schemaMutationAccessId = '0199325a-0c00-7000-8000-000000000260'
const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationAccessId,
	secret: 'private',
	title: 'visible',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

class SchemaMutationTransaction implements DatabaseTransactionAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-transaction-adapter' as const
	readonly preparations: DatabaseOperationRequest[] = []

	commit(): Promise<void> {
		return Promise.resolve()
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Schema mutation fixture does not execute direct reads')
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.preparations.push(request)
		let attempted = false
		const prepared = immutableRecord({
			target: previousRow,
			execute: () => {
				if (attempted) {
					throw new TypeError('Prepared fixture mutation already executed')
				}
				attempted = true
				return Promise.resolve(
					immutableRecord({
						materializations: immutableArray([
							immutableRecord({
								current: currentRow,
								kind: 'update' as const,
								previous: previousRow,
							}),
						]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
						result: immutableRecord({
							id: currentRow.id,
							secret: currentRow.secret,
							title: currentRow.title,
							workflowState: currentRow.workflowState,
						}) as unknown as DatabaseOperationResult<TOperation>,
					}),
				)
			},
		})

		return Promise.resolve(
			prepared as unknown as PreparedDatabaseOperation<TOperation>,
		)
	}

	rollback(): Promise<void> {
		return Promise.resolve()
	}
}

/** Records each automatic transaction and prepared target restriction. */
export class SchemaMutationAdapter implements DatabaseAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-adapter' as const
	readonly transactions: SchemaMutationTransaction[] = []

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new SchemaMutationTransaction()
		this.transactions.push(transaction)
		return Promise.resolve(transaction)
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Schema mutation fixture requires a transaction')
	}
}
