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

export const schemaMutationRestId = '0199325a-0c00-7000-8000-000000000266'

const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationRestId,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})

/** Implements the one prepared update required by the REST mutation fixture. */
class RestSchemaMutationTransaction implements DatabaseTransactionAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-transaction-adapter' as const

	constructor(private readonly trace: string[]) {}

	commit(): Promise<void> {
		this.trace.push('commit')
		return Promise.resolve()
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('REST schema mutation fixture executes prepared work')
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.trace.push(`prepare:${request.operation.kind}`)
		const prepared = immutableRecord({
			target: previousRow,
			execute: (
				execution?: Readonly<{
					readonly operation: DatabaseMutationOperationAst
				}>,
			) => {
				if (execution?.operation.kind !== 'update-one') {
					throw new TypeError('REST schema mutation fixture expects an update')
				}
				this.trace.push('execute:update-one')
				const current = immutableRecord({
					...previousRow,
					workflowState: 'archived',
				})
				return Promise.resolve(
					immutableRecord({
						materializations: immutableArray([
							immutableRecord({
								current,
								kind: 'update' as const,
								previous: previousRow,
							}),
						]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
						result: immutableRecord({
							id: current.id,
							title: current.title,
							workflowState: current.workflowState,
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

/** Records whether malformed requests reach persistence. */
export class RestSchemaMutationAdapter implements DatabaseAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-adapter' as const
	transactions = 0

	constructor(readonly trace: string[]) {}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.transactions += 1
		this.trace.push('begin')
		return Promise.resolve(new RestSchemaMutationTransaction(this.trace))
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('REST schema mutation fixture requires a transaction')
	}
}
