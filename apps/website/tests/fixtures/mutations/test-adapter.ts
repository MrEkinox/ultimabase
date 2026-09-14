import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationOutcome,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'

export interface MutationAdapterFixture {
	readonly materializations: readonly DatabaseMutationMaterialization[]
	readonly result: unknown
	readonly target?: DatabaseLogicalRecord | null
}

/** Provides deterministic mutation outcomes while exercising Core's public Runtime. */
export class MutationTestAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly trace: string[] = []
	readonly #fixtures: MutationAdapterFixture[]

	constructor(fixtures: readonly MutationAdapterFixture[]) {
		this.#fixtures = [...fixtures]
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return Promise.reject(
			new TypeError(`Unexpected root ${request.operation.kind} operation`),
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.trace.push('begin')
		return Promise.resolve(
			new MutationTestTransaction(this.#fixtures, this.trace),
		)
	}
}

class MutationTestTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly #fixtures: MutationAdapterFixture[]
	readonly #trace: string[]

	constructor(fixtures: MutationAdapterFixture[], trace: string[]) {
		this.#fixtures = fixtures
		this.#trace = trace
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return Promise.reject(
			new TypeError(`Unexpected transaction ${request.operation.kind} read`),
		)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		const fixture = this.#fixtures.shift()
		if (fixture === undefined) {
			return Promise.reject(new TypeError('Missing mutation adapter fixture'))
		}

		this.#trace.push(`prepare:${request.operation.kind}`)
		let attempted = false
		const handle = {
			execute: (): Promise<DatabaseOperationOutcome<TOperation>> => {
				if (attempted) {
					return Promise.reject(
						new TypeError('Prepared mutation was already attempted'),
					)
				}
				attempted = true
				this.#trace.push(`execute:${request.operation.kind}`)

				return Promise.resolve({
					materializations: fixture.materializations,
					result: fixture.result,
				} as unknown as DatabaseOperationOutcome<TOperation>)
			},
		}
		const needsTarget =
			request.operation.kind === 'delete-one' ||
			request.operation.kind === 'update-one' ||
			request.operation.kind === 'upsert-one'

		return Promise.resolve(
			(needsTarget
				? { ...handle, target: fixture.target ?? null }
				: handle) as unknown as PreparedDatabaseOperation<TOperation>,
		)
	}

	commit(): Promise<void> {
		this.#trace.push('commit')
		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.#trace.push('rollback')
		return Promise.resolve()
	}
}

export const mutationDatabasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => ({ value: adapter }),
				}),
			],
		},
		core: '^0.0.0',
		pluginId: 'fixture.website-mutation-database',
		version: '0.0.0',
	})
