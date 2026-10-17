import process from 'node:process'

import {
	databaseAdapterCapability,
	databaseResetCapability,
	databaseResetCapabilityVersion,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'
import { Client } from 'pg'

import { MemoryTestDatabase } from '../../../../../tooling/vitest/memory-database.js'

/** What the database plugin saw while the application started. */
export interface UrlDatabaseConnection {
	/** `DATABASE_URL` when the plugin connected, as postgresPlugin() reads it. */
	readonly url: string | undefined
	/** The schema its connection resolves unqualified names in. */
	readonly schema: string
	/** The `application_name` its connection reports. */
	readonly applicationName: string
}

/** Configures one {@link urlDatabasePlugin}. */
export interface UrlDatabasePluginOptions {
	/** `false` keeps rows in memory without connecting, like a plugin given `url`. */
	readonly connect?: boolean
	/** Fails the start at `ready`, after connecting. */
	readonly failReady?: Error
	/** Fails the disposal, after closing the connection. */
	readonly failDispose?: Error | undefined
	/** Receives `connect`, `ready`, `reset`, `dispose` and caller entries. */
	readonly trace?: string[]
}

/** Rows live in memory; a reset replaces them all, as TRUNCATE would. */
class ResettableMemoryDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	#current = new MemoryTestDatabase()
	readonly capabilities = this.#current.capabilities

	checkHealth(): Promise<void> {
		return this.#current.checkHealth()
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return this.#current.execute(request)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return this.#current.beginTransaction()
	}

	reset(): void {
		this.#current = new MemoryTestDatabase()
	}
}

/**
 * A database plugin that, like postgresPlugin(), opens its connection from
 * `DATABASE_URL` when the application starts and provides a data reset. Rows
 * stay in memory: testApplication's contract is the connection it isolates.
 */
export const urlDatabasePlugin = (options: UrlDatabasePluginOptions = {}) => {
	const trace = options.trace ?? []
	const connections: UrlDatabaseConnection[] = []
	const database = new ResettableMemoryDatabase()
	return {
		connections,
		plugin: plugin({
			core: '^0.0.0',
			id: 'fixture.url-database',
			version: '1.0.0',
			contributions: [
				contributeApplication(() => {
					let client: Client | undefined
					return {
						connect: async () => {
							trace.push('connect')
							if (options.connect === false) return
							const url = process.env.DATABASE_URL
							client = new Client({ connectionString: url })
							await client.connect()
							const result = await client.query<{
								readonly schema: string
								readonly name: string
							}>(
								"SELECT current_schema() AS schema, current_setting('application_name') AS name",
							)
							const row = result.rows[0]
							if (row === undefined) throw new Error('No connection row')
							connections.push({
								url,
								schema: row.schema,
								applicationName: row.name,
							})
						},
						ready: () => {
							trace.push('ready')
							if (options.failReady !== undefined) throw options.failReady
						},
						dispose: async () => {
							trace.push('dispose')
							await client?.end()
							if (options.failDispose !== undefined) {
								throw options.failDispose
							}
						},
					}
				}),
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => ({ value: database }),
				}),
				provideCapability(databaseResetCapability, {
					contributionId: 'reset',
					create: () => ({
						value: {
							kind: 'reset' as const,
							version: databaseResetCapabilityVersion,
							reset: () => {
								trace.push('reset')
								database.reset()
								return Promise.resolve()
							},
						},
					}),
				}),
			],
		}),
		trace,
	}
}

/** Answers `t.fetch` in place of the HTTP plugin, with `exports` as given. */
export const fakeHttpPlugin = <const TExports>(exports: TExports) =>
	plugin({
		core: '^0.0.0',
		id: '@ultimabase/http-plugin',
		version: '1.0.0',
		contributions: [contributeApplication(() => ({ exports }))],
	})
