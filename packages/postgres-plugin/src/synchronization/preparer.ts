import { FrameworkError } from '@ultimabase/core'
import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import type { PostgresPool } from '../connection/contracts.js'
import { readPostgresDriverCode } from '../connection/driver-error.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import { introspectPostgresDatabase } from '../introspection/introspector.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaChange, PostgresSchemaPolicy } from './contracts.js'
import { compileDesiredPostgresTables } from './desired-schema.js'
import { planPostgresSchemaChanges } from './planner.js'
import { renderPostgresSchemaChange } from './sql-renderer.js'

const readCurrentNamespace = async (pool: PostgresPool): Promise<string> => {
	const result: unknown = await pool.query(
		'SELECT current_schema() AS namespace',
	)
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

const rejectChanges = (
	message: string,
	kind: 'postgres-schema-drift' | 'postgres-schema-unsupported',
	changes: readonly PostgresSchemaChange[],
): never => {
	throw new FrameworkError('VALIDATION_ERROR', message, {
		internalDetails: { kind, changes: immutableArray(changes) },
	})
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
		try {
			await client.query('ROLLBACK')
		} catch {
			// The original mutation failure remains the actionable sanitized boundary.
		}

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
	const desired = compileDesiredPostgresTables(
		[...catalog.values(), ...catalog.privateValues()],
		catalog.relationValues(),
	)
	const live = await introspectPostgresDatabase(
		pool,
		namespace,
		catalog.tableNames(),
	)
	const changes = planPostgresSchemaChanges(desired, live)

	if (changes.length === 0) return
	if (policy === 'fail') {
		rejectChanges(
			'PostgreSQL schema differs from the registered UltimaBase schemas.',
			'postgres-schema-drift',
			changes,
		)
	}

	const unsupported = changes.filter(
		({ kind }) => kind === 'unsupported-structure',
	)

	if (unsupported.length > 0) {
		rejectChanges(
			'PostgreSQL contains structures that direct synchronization cannot safely replace.',
			'postgres-schema-unsupported',
			unsupported,
		)
	}

	await executeChanges(pool, namespace, changes)
}
