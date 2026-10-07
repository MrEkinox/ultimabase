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

type PreparedMutationHandler = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	request: DatabaseOperationRequest<TOperation>,
) => Promise<PreparedDatabaseOperation<TOperation>>

export interface PreparedMutationTestAdapterOptions {
	readonly description: string
	readonly prepare: PreparedMutationHandler
	readonly trace?: string[]
}

/** Captures the common transaction protocol used by prepared-mutation tests. */
export class PreparedMutationTestTransaction implements DatabaseTransactionAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-transaction-adapter' as const
	readonly preparations: DatabaseOperationRequest[] = []

	constructor(private readonly options: PreparedMutationTestAdapterOptions) {}

	commit(): Promise<void> {
		this.options.trace?.push('commit')
		return Promise.resolve()
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError(`${this.options.description} executes prepared work`)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.preparations.push(request)
		this.options.trace?.push(`prepare:${request.operation.kind}`)
		return this.options.prepare(request)
	}

	rollback(): Promise<void> {
		this.options.trace?.push('rollback')
		return Promise.resolve()
	}
}

/** Owns transaction creation while product fixtures retain prepared behavior. */
export class PreparedMutationTestAdapter implements DatabaseAdapter {
	readonly capabilities: DatabaseAdapterCapabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly kind = 'database-adapter' as const
	readonly transactions: PreparedMutationTestTransaction[] = []

	constructor(private readonly options: PreparedMutationTestAdapterOptions) {}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.options.trace?.push('begin')
		const transaction = new PreparedMutationTestTransaction(this.options)
		this.transactions.push(transaction)
		return Promise.resolve(transaction)
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError(`${this.options.description} requires a transaction`)
	}
}

interface PreparedUpdateTestOperationOptions {
	readonly current: Readonly<Record<string, unknown>>
	readonly description: string
	readonly previous: Readonly<Record<string, unknown>>
	readonly result: unknown
	readonly trace?: string[]
}

/** Builds the canonical single-use update outcome shared by transport fixtures. */
export const createPreparedUpdateTestOperation = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	_request: DatabaseOperationRequest<TOperation>,
	options: PreparedUpdateTestOperationOptions,
): Promise<PreparedDatabaseOperation<TOperation>> => {
	let attempted = false
	const prepared = immutableRecord({
		target: options.previous,
		execute: (
			execution?: Readonly<{
				readonly operation: DatabaseMutationOperationAst
			}>,
		) => {
			if (attempted) {
				throw new TypeError('Prepared fixture mutation already executed')
			}
			attempted = true
			if (execution?.operation.kind !== 'update-one') {
				throw new TypeError(`${options.description} expects an update`)
			}
			options.trace?.push('execute:update-one')
			return Promise.resolve(
				immutableRecord({
					materializations: immutableArray([
						immutableRecord({
							current: options.current,
							kind: 'update' as const,
							previous: options.previous,
						}),
					]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
					result: options.result as DatabaseOperationResult<TOperation>,
				}),
			)
		},
	})

	return Promise.resolve(
		prepared as unknown as PreparedDatabaseOperation<TOperation>,
	)
}
