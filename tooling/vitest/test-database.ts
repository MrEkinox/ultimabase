import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

/** Names the support plugin that installs one test database. */
export interface TestDatabasePluginOptions<TId extends string> {
	/** Plugin id, kept literal so applications keep their plugin map typed. */
	readonly id: TId
	/** Capability contribution id; defaults to `database`. */
	readonly contributionId?: string
}

/** Installs one test database through the public adapter capability. */
export const testDatabasePlugin = <const TId extends string>(
	adapter: DatabaseAdapter,
	options: TestDatabasePluginOptions<TId>,
) =>
	plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: options.contributionId ?? 'database',
				create: () => ({ value: adapter }),
			}),
		],
		core: '^0.0.0',
		id: options.id,
		version: '1.0.0',
	})

/** Configures one scripted test database. */
export interface ScriptedTestDatabaseOptions {
	/** Names the fixture in the errors of calls it refuses. */
	readonly description?: string
	/** Defaults to the persistence-plan protocol only. */
	readonly capabilities?: DatabaseAdapterCapabilities
	/** Answers every read with this value; without it, reads reject. */
	readonly result?: unknown
	/**
	 * `reject` (default) refuses every transaction; `empty` opens transactions
	 * that commit and roll back but refuse every statement.
	 */
	readonly transactions?: 'empty' | 'reject'
	readonly checkHealth?: (signal: AbortSignal) => Promise<void>
}

const defaultCapabilities: DatabaseAdapterCapabilities = Object.freeze({
	persistencePlans: databasePersistencePlanCapability,
})

/**
 * Answers every read with one scripted value and records each request.
 *
 * Use it when a test needs an adapter to start the application, or one fixed
 * read result to inspect what Runtime sends; use `MemoryTestDatabase` when the
 * answer must follow the operation like a real database.
 */
export class ScriptedTestDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities: DatabaseAdapterCapabilities
	readonly checkHealth: (signal: AbortSignal) => Promise<void>
	readonly requests: DatabaseOperationRequest[] = []
	readonly #options: ScriptedTestDatabaseOptions
	readonly #description: string

	constructor(options: ScriptedTestDatabaseOptions = {}) {
		this.#options = options
		this.#description = options.description ?? 'Scripted test database'
		this.capabilities = options.capabilities ?? defaultCapabilities
		this.checkHealth = options.checkHealth ?? (() => Promise.resolve())
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		if (!Object.hasOwn(this.#options, 'result')) {
			return this.#refuse(`${this.#description} does not read`)
		}
		// The test scripts a value matching the operation it sends.
		return Promise.resolve(
			this.#options.result as DatabaseOperationResult<TOperation>,
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		if (this.#options.transactions !== 'empty') {
			return this.#refuse(`${this.#description} does not write`)
		}
		const refuse = (): Promise<never> =>
			this.#refuse(`${this.#description} does not execute statements`)
		return Promise.resolve({
			capabilities: this.capabilities,
			commit: () => Promise.resolve(),
			execute: refuse,
			kind: 'database-transaction-adapter',
			prepare: refuse,
			rollback: () => Promise.resolve(),
		})
	}

	#refuse(message: string): Promise<never> {
		return Promise.reject(new TypeError(message))
	}
}
