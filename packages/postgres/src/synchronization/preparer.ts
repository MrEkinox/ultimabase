import { FrameworkError } from '@ultimabase/core'
import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { readPostgresDriverCode } from '../connection/driver-error.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import { introspectPostgresDatabase } from '../introspection/introspector.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaChange, PostgresSchemaPolicy } from './contracts.js'
import { compileDesiredPostgresTables } from './desired-schema.js'
import { planPostgresSchemaChanges } from './planner.js'
import { renderPostgresSchemaChange } from './sql-renderer.js'

const currentNamespaceQuery = 'SELECT current_schema() AS namespace'

const readCurrentNamespace = async (pool: PostgresPool): Promise<string> => {
	const result: unknown = await pool.query(currentNamespaceQuery)
	const row = readPostgresQueryRows(result, 'PostgreSQL namespace query')[0]

	if (
		!isPlainRecord(row) ||
		typeof row.namespace !== 'string' ||
		row.namespace.length === 0
	) {
		throw new TypeError(
			'PostgreSQL current namespace must be a non-empty string',
		)
	}

	return row.namespace
}

const throwSchemaDrift = (changes: readonly PostgresSchemaChange[]): never => {
	throw new FrameworkError(
		'VALIDATION_ERROR',
		'PostgreSQL schema differs from the registered UltimaBase schemas.',
		{
			internalDetails: {
				kind: 'postgres-schema-drift',
				changes: immutableArray(changes),
			},
		},
	)
}

const assertSupportedChanges = (
	changes: readonly PostgresSchemaChange[],
): void => {
	const unsupported = changes.filter(
		(change) => change.kind === 'unsupported-structure',
	)

	if (unsupported.length > 0) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'PostgreSQL contains structures that direct synchronization cannot safely replace.',
			{
				internalDetails: {
					kind: 'postgres-schema-unsupported',
					changes: immutableArray(unsupported),
				},
			},
		)
	}
}

const rollbackQuietly = async (client: PostgresPoolClient): Promise<void> => {
	try {
		await client.query('ROLLBACK')
	} catch {
		// The original mutation failure remains the actionable sanitized boundary.
	}
}

const executeChanges = async (
	pool: PostgresPool,
	namespace: string,
	changes: readonly PostgresSchemaChange[],
): Promise<void> => {
	const statements = changes.flatMap((change) =>
		renderPostgresSchemaChange(namespace, change),
	)

	if (statements.length === 0) return

	const client = await pool.connect()

	try {
		await client.query('BEGIN')

		for (const statement of statements) {
			await client.query(statement)
		}

		await client.query('COMMIT')
	} catch (error: unknown) {
		await rollbackQuietly(client)
		const driverCode = readPostgresDriverCode(error)

		// Driver messages and causes may contain values or connection details.
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'PostgreSQL direct schema synchronization failed.',
			{
				internalDetails: {
					kind: 'postgres-schema-synchronization-failed',
					...(driverCode === undefined ? {} : { driverCode }),
				},
			},
		)
	} finally {
		client.release()
	}
}

/** Applies the built-in policy only when no database-specific migrator owns preparation. */
export const prepareDirectPostgresSchema = async (
	pool: PostgresPool,
	catalog: PostgresSchemaCatalog,
	policy: PostgresSchemaPolicy,
): Promise<void> => {
	if (policy === 'ignore') return

	const namespace = await readCurrentNamespace(pool)
	const desired = compileDesiredPostgresTables(catalog.values())
	const live = await introspectPostgresDatabase(
		pool,
		namespace,
		catalog.tableNames(),
	)
	const changes = planPostgresSchemaChanges(desired, live)

	if (changes.length === 0) return
	if (policy === 'fail') throwSchemaDrift(changes)

	assertSupportedChanges(changes)
	await executeChanges(pool, namespace, changes)
}
