import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationOutcome,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'

const capabilities: DatabaseAdapterCapabilities = Object.freeze({
	persistencePlans: databasePersistencePlanCapability,
})

/** Retains deterministic adapter boundaries without introducing wall-clock noise. */
export interface DeterministicDatabaseCounts {
	readonly reads: number
	readonly preparedMutations: number
	readonly executedMutations: number
	readonly transactions: number
	readonly commits: number
}

interface MutableDatabaseCounts {
	reads: number
	preparedMutations: number
	executedMutations: number
	transactions: number
	commits: number
}

const createRecord = (title: string): DatabaseLogicalRecord =>
	Object.freeze({
		createdAt: '2026-08-21T08:00:00.000Z',
		id: '019ca947-3c00-7000-8000-000000000001',
		title,
		updatedAt: '2026-08-21T08:00:00.000Z',
	})

const readRecord = createRecord('Measured read')
const createdRecord = createRecord('Measured mutation')

const mutationResult = <
	const TOperation extends DatabaseMutationOperationAst,
>(): DatabaseOperationOutcome<TOperation> =>
	({
		materializations: [
			{ kind: 'create', current: createdRecord },
		] as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
		result: createdRecord,
	}) as unknown as DatabaseOperationOutcome<TOperation>

class DeterministicTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = capabilities
	readonly #counts: MutableDatabaseCounts

	constructor(counts: MutableDatabaseCounts) {
		this.#counts = counts
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		return Promise.reject(
			new TypeError(
				'The deterministic fixture expects prepared mutations only',
			),
		)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(): Promise<
		PreparedDatabaseOperation<TOperation>
	> {
		this.#counts.preparedMutations += 1
		let executed = false
		const prepared = {
			execute: (): Promise<DatabaseOperationOutcome<TOperation>> => {
				if (executed) {
					return Promise.reject(
						new TypeError('Prepared fixture mutation already executed'),
					)
				}
				executed = true
				this.#counts.executedMutations += 1

				return Promise.resolve(mutationResult<TOperation>())
			},
		}

		return Promise.resolve(
			prepared as unknown as PreparedDatabaseOperation<TOperation>,
		)
	}

	commit(): Promise<void> {
		this.#counts.commits += 1
		return Promise.resolve()
	}

	rollback(): Promise<void> {
		return Promise.resolve()
	}
}

/** Supplies one deterministic database and its detached work counters. */
export class DeterministicDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = capabilities
	readonly #counts: MutableDatabaseCounts = {
		reads: 0,
		preparedMutations: 0,
		executedMutations: 0,
		transactions: 0,
		commits: 0,
	}

	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		this.#counts.reads += 1

		return Promise.resolve([
			readRecord,
		] as unknown as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.#counts.transactions += 1
		return Promise.resolve(new DeterministicTransactionAdapter(this.#counts))
	}

	snapshot(): DeterministicDatabaseCounts {
		return Object.freeze({ ...this.#counts })
	}
}

/** Installs one fixture adapter through the same public capability as real databases. */
export const deterministicDatabasePlugin = (
	adapter: DatabaseAdapter,
): PluginDefinition =>
	plugin({
		id: 'fixture.performance-database',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'deterministic-database',
				create: () => ({ value: adapter }),
			}),
		],
	})
