import { FrameworkError, type Logger } from '@ultimabase/core'
import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import type { PostgresPool } from '../connection/contracts.js'
import { readPostgresDriverCode } from '../connection/driver-error.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import { introspectPostgresDatabase } from '../introspection/introspector.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	describePostgresSchemaChange,
	explainPostgresSynchronizationFailure,
	summarizePostgresSchemaChanges,
} from './change-description.js'
import type { PostgresSchemaChange, PostgresSchemaPolicy } from './contracts.js'
import { compileDesiredPostgresTables } from './desired-schema.js'
import {
	applyExistingRows,
	describeExistingRows,
	findMissingExistingRows,
	readExistingRowsColumns,
} from './existing-rows.js'
import { planPostgresSchemaChanges } from './planner.js'
import {
	describeUnmanagedPostgresColumn,
	findUnmanagedPostgresColumns,
	isWideningPostgresTypeChange,
} from './safety.js'
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
	kind:
		| 'postgres-schema-drift'
		| 'postgres-schema-unsafe-type-change'
		| 'postgres-schema-unsupported',
	changes: readonly PostgresSchemaChange[],
	advice = '',
): never => {
	throw new FrameworkError(
		'VALIDATION_ERROR',
		`${message} ${String(changes.length)} change(s): ${summarizePostgresSchemaChanges(changes)}.${advice}`,
		{ internalDetails: { kind, changes: immutableArray(changes) } },
	)
}

/** Only widening conversions apply on their own; others need a migration. */
const isUnsafeChange = (change: PostgresSchemaChange): boolean =>
	change.kind === 'alter-column-type' &&
	!isWideningPostgresTypeChange(change.from, change.to)

const executeChanges = async (
	pool: PostgresPool,
	namespace: string,
	changes: readonly PostgresSchemaChange[],
	logger: Logger,
): Promise<void> => {
	const steps = changes.flatMap((change) =>
		renderPostgresSchemaChange(namespace, change).map((statement) => ({
			change,
			statement,
		})),
	)

	if (steps.length === 0) return

	const client = await pool.connect()
	let current: PostgresSchemaChange | undefined

	try {
		await client.query('BEGIN')

		for (const { change, statement } of steps) {
			current = change
			await client.query(statement)
		}
		current = undefined

		await client.query('COMMIT')
		// One line per applied change, physical names and types only (ADR-0320).
		for (const change of changes) {
			logger.info(
				`schema change applied: ${describePostgresSchemaChange(change)}`,
			)
		}
	} catch (error: unknown) {
		try {
			await client.query('ROLLBACK')
		} catch {
			// The original mutation failure remains the actionable sanitized boundary.
		}

		const driverCode = readPostgresDriverCode(error)

		// Driver messages and causes may contain values or connection details:
		// only the planned change, its physical names and SQLSTATE are reported.
		const failedStep =
			current === undefined
				? ''
				: ` while applying: ${describePostgresSchemaChange(current)}`
		const code = driverCode === undefined ? '' : ` [SQLSTATE ${driverCode}]`
		const hint =
			current === undefined
				? ''
				: explainPostgresSynchronizationFailure(current, driverCode)
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`PostgreSQL direct schema synchronization failed${failedStep}${code}.${hint}`,
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

/**
 * Refuses a required column that no field declares (every insert would fail)
 * and warns about an optional one that looks renamed (ADR-0320).
 */
const checkUnmanagedColumns = (
	desired: Parameters<typeof findUnmanagedPostgresColumns>[0],
	live: Parameters<typeof findUnmanagedPostgresColumns>[1],
	changes: readonly PostgresSchemaChange[],
	logger: Logger,
): void => {
	const unmanaged = findUnmanagedPostgresColumns(desired, live, changes)
	const blocking = unmanaged.filter(({ blocksInserts }) => blocksInserts)

	if (blocking.length > 0) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			`PostgreSQL schema has ${String(blocking.length)} required column(s) that no field declares, so every insert would fail: ${blocking.map(describeUnmanagedPostgresColumn).join('; ')}. Unless a column was renamed, make it optional, give it a default or drop it with a migration outside UltimaBase.`,
			{
				internalDetails: {
					kind: 'postgres-schema-unmanaged-required-column',
					columns: immutableArray(
						blocking.map(({ column, table }) => `${table}.${column.name}`),
					),
				},
			},
		)
	}

	for (const column of unmanaged) {
		if (column.renameCandidates.length === 0) continue
		logger.warn(
			`column ${describeUnmanagedPostgresColumn(column)}; otherwise its data stays in the old column.`,
		)
	}
}

/** Applies the built-in policy only when no database-specific migrator owns preparation. */
export const prepareDirectPostgresSchema = async (
	pool: PostgresPool,
	catalog: PostgresSchemaCatalog,
	policy: PostgresSchemaPolicy,
	logger: Logger,
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
	const planned = planPostgresSchemaChanges(desired, live)

	if (policy === 'override') {
		checkUnmanagedColumns(desired, live, planned, logger)
	}
	if (planned.length === 0) return
	// Required columns added to tables with rows take their field's
	// `existingRows` value (ADR-0321).
	const existingRows = await readExistingRowsColumns(pool, namespace, planned)
	if (policy === 'fail') {
		rejectChanges(
			'PostgreSQL schema differs from the registered UltimaBase schemas.',
			'postgres-schema-drift',
			planned,
			describeExistingRows(existingRows),
		)
	}
	const missing = findMissingExistingRows(existingRows)
	if (missing.length > 0) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			`PostgreSQL cannot add a required column to a table that has rows without a value for them. ${missing.join(' ')}`,
			{ internalDetails: { kind: 'postgres-schema-existing-rows-missing' } },
		)
	}
	const changes = applyExistingRows(planned, existingRows)

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

	const unsafe = changes.filter(isUnsafeChange)

	if (unsafe.length > 0) {
		rejectChanges(
			'PostgreSQL direct synchronization applies only widening type conversions; it refuses',
			'postgres-schema-unsafe-type-change',
			unsafe,
			' Restore the field type, or convert the column with a migration outside UltimaBase.',
		)
	}

	await executeChanges(pool, namespace, changes, logger)
}
