import {
	databaseResetCapability,
	databaseResetCapabilityVersion,
	type DatabaseResetCapability,
} from '@ultimabase/core'
import {
	provideCapability,
	type CapabilityProviderDeclaration,
} from '@ultimabase/core/plugin'

import type { PostgresPool } from '../connection/contracts.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'

type ResetCatalog = Pick<PostgresSchemaCatalog, 'tableNames'>

const quoteIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`

/**
 * Empties every table the catalog manages (schemas, relation links and
 * private storage) in one statement, so foreign keys between them never
 * block it, and restarts their identity sequences (ADR-0327). Names resolve
 * through the connection's `search_path`, like every adapter query. Without
 * `CASCADE`, an unmanaged table that references a managed one makes the
 * reset fail instead of emptying data the application does not own.
 */
export const resetPostgresTables = async (
	pool: PostgresPool,
	catalog: ResetCatalog,
): Promise<void> => {
	const tables = catalog.tableNames()
	if (tables.length === 0) return
	await pool.query(
		`TRUNCATE TABLE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY`,
	)
}

/**
 * Provides the data reset of a test harness (ADR-0327); no request path calls
 * it. Connections and catalogs are the plugin's, keyed by application schemas.
 */
export const providePostgresReset = (
	connections: WeakMap<object, Readonly<{ getPool(): PostgresPool }>>,
	catalogs: WeakMap<object, ResetCatalog>,
): CapabilityProviderDeclaration<typeof databaseResetCapability> =>
	provideCapability(databaseResetCapability, {
		contributionId: 'database-reset',
		create: ({ schemas }) => {
			const value: DatabaseResetCapability = Object.freeze({
				kind: 'reset',
				version: databaseResetCapabilityVersion,
				reset: async () => {
					const connection = connections.get(schemas)
					const catalog = catalogs.get(schemas)
					if (connection === undefined || catalog === undefined) {
						throw new TypeError('PostgreSQL is not started')
					}
					await resetPostgresTables(connection.getPool(), catalog)
				},
			})
			return { value }
		},
	})
