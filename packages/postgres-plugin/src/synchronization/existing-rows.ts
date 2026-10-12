import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { PostgresPool } from '../connection/contracts.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import type { PostgresSchemaChange } from './contracts.js'

const quoteIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`

type AddColumnChange = Extract<PostgresSchemaChange, { kind: 'add-column' }>

/** One required column whose field tells what existing rows receive (ADR-0321). */
export interface PostgresExistingRowsColumn {
	readonly change: AddColumnChange
	/** `undefined` while the table has no row. */
	readonly existingRows:
		Readonly<{ expression: string }> | Readonly<{ missing: string }> | undefined
}

const tableHasRows = async (
	pool: PostgresPool,
	namespace: string,
	table: string,
): Promise<boolean> => {
	const result: unknown = await pool.query(
		`SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(namespace)}.${quoteIdentifier(table)} LIMIT 1) AS has_rows`,
	)
	const [row] = readPostgresQueryRows(result, 'PostgreSQL existing rows query')
	return (
		typeof row === 'object' &&
		row !== null &&
		Reflect.get(row, 'has_rows') === true
	)
}

/**
 * Finds the required columns the plan adds to tables that already have rows
 * and whose field declares `existingRows`. Only these tables are read, once.
 */
export const readExistingRowsColumns = async (
	pool: PostgresPool,
	namespace: string,
	changes: readonly PostgresSchemaChange[],
): Promise<readonly PostgresExistingRowsColumn[]> => {
	const candidates = changes.filter(
		(change): change is AddColumnChange =>
			change.kind === 'add-column' &&
			!change.column.nullable &&
			change.column.existingRows !== undefined,
	)
	const hasRows = new Map<string, boolean>()
	const columns: PostgresExistingRowsColumn[] = []
	for (const change of candidates) {
		let rows = hasRows.get(change.table)
		if (rows === undefined) {
			rows = await tableHasRows(pool, namespace, change.table)
			hasRows.set(change.table, rows)
		}
		columns.push(
			immutableRecord({
				change,
				existingRows: rows ? change.column.existingRows : undefined,
			}),
		)
	}
	return immutableArray(columns)
}

/** Names, for a `fail` policy message, what existing rows would receive. */
export const describeExistingRows = (
	columns: readonly PostgresExistingRowsColumn[],
): string =>
	columns
		.flatMap(({ change, existingRows }) =>
			existingRows === undefined
				? []
				: [
						'expression' in existingRows
							? ` Existing rows of "${change.table}" would receive ${existingRows.expression} in "${change.column.name}".`
							: ` ${existingRows.missing}`,
					],
		)
		.join('')

/** Lists the columns whose existing rows have no value, for `start()` to refuse. */
export const findMissingExistingRows = (
	columns: readonly PostgresExistingRowsColumn[],
): readonly string[] =>
	columns.flatMap(({ existingRows }) =>
		existingRows !== undefined && 'missing' in existingRows
			? [existingRows.missing]
			: [],
	)

/**
 * Adds each column with its existing-rows value as a temporary default
 * (`ADD COLUMN … NOT NULL DEFAULT …`, no table rewrite since PostgreSQL 11),
 * then restores the column's own default.
 */
export const applyExistingRows = (
	changes: readonly PostgresSchemaChange[],
	columns: readonly PostgresExistingRowsColumn[],
): readonly PostgresSchemaChange[] =>
	changes.flatMap((change): readonly PostgresSchemaChange[] => {
		const backfill = columns.find((column) => column.change === change)
		const existingRows = backfill?.existingRows
		if (
			change.kind !== 'add-column' ||
			existingRows === undefined ||
			!('expression' in existingRows)
		) {
			return [change]
		}
		const { defaultExpression } = change.column
		return [
			immutableRecord({
				...change,
				column: immutableRecord({
					...change.column,
					defaultExpression: existingRows.expression,
				}),
			}),
			immutableRecord({
				column: change.column.name,
				kind: 'set-column-default' as const,
				...(defaultExpression === undefined
					? {}
					: { expression: defaultExpression }),
				table: change.table,
			}),
		]
	})
