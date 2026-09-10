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
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

export const schemaMutationHookId = '0199325a-0c00-7000-8000-000000000261'
const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationHookId,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

export class SchemaMutationHookTransaction implements DatabaseTransactionAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-transaction-adapter' as const
	readonly preparations: DatabaseOperationRequest[] = []

	constructor(readonly trace: string[]) {}

	commit(): Promise<void> {
		this.trace.push('commit')
		return Promise.resolve()
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Schema mutation Hook fixture does not execute reads')
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.preparations.push(request)
		this.trace.push(`prepare:${request.operation.kind}`)
		const operation: unknown = request.operation
		if (isPlainRecord(operation) && operation.kind === 'create-one') {
			if (!isPlainRecord(operation.input)) {
				throw new TypeError('Nested Hook create input must be a record')
			}
			const created = immutableRecord({
				...operation.input,
				createdAt: '2026-09-10T00:00:00.000Z',
				id: '0199325a-0c00-7000-8000-000000000262',
				updatedAt: '2026-09-10T00:00:00.000Z',
			})
			const create = immutableRecord({
				execute: () => {
					this.trace.push('execute:create-one')
					return Promise.resolve(
						immutableRecord({
							materializations: immutableArray([
								immutableRecord({
									current: created,
									kind: 'create' as const,
								}),
							]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
							result: created as unknown as DatabaseOperationResult<TOperation>,
						}),
					)
				},
			})
			return Promise.resolve(
				create as unknown as PreparedDatabaseOperation<TOperation>,
			)
		}
		let attempted = false
		const prepared = immutableRecord({
			target: previousRow,
			execute: (
				execution?: Readonly<{
					readonly operation: DatabaseMutationOperationAst
				}>,
			) => {
				if (attempted) {
					throw new TypeError('Prepared fixture mutation already executed')
				}
				attempted = true
				const kind = execution?.operation.kind
				this.trace.push(`execute:${String(kind)}`)
				if (kind === 'delete-one') {
					return Promise.resolve(
						immutableRecord({
							materializations: immutableArray([
								immutableRecord({
									kind: 'delete' as const,
									previous: previousRow,
								}),
							]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
							result: immutableRecord({
								id: previousRow.id,
								title: previousRow.title,
								workflowState: previousRow.workflowState,
							}) as unknown as DatabaseOperationResult<TOperation>,
						}),
					)
				}
				if (kind !== 'update-one') {
					throw new TypeError(
						'Schema mutation Hook fixture received an invalid effect',
					)
				}
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
		this.trace.push('rollback')
		return Promise.resolve()
	}
}

/** Records the exact transaction boundary around one custom mutation. */
export class SchemaMutationHookAdapter implements DatabaseAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-adapter' as const
	readonly transactions: SchemaMutationHookTransaction[] = []

	constructor(readonly trace: string[]) {}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.trace.push('begin')
		const transaction = new SchemaMutationHookTransaction(this.trace)
		this.transactions.push(transaction)
		return Promise.resolve(transaction)
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Schema mutation Hook fixture requires a transaction')
	}
}
