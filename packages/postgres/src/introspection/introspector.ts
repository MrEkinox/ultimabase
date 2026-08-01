import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PostgresPool } from '../connection/contracts.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import type {
	PostgresColumnSnapshot,
	PostgresConstraintSnapshot,
	PostgresDatabaseSnapshot,
	PostgresIdentityKind,
	PostgresIndexSnapshot,
	PostgresTableSnapshot,
	PostgresUnsupportedStructure,
} from './contracts.js'

const columnsQuery = `
SELECT
  table_class.relname AS table_name,
  table_class.relkind AS table_kind,
  attribute.attname AS column_name,
  format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
  NOT attribute.attnotnull AS nullable,
  pg_get_expr(column_default.adbin, column_default.adrelid) AS default_expression,
  attribute.attidentity AS identity_kind,
  attribute.attgenerated AS generated_kind
FROM pg_catalog.pg_class AS table_class
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_class.relnamespace
LEFT JOIN pg_catalog.pg_attribute AS attribute
  ON attribute.attrelid = table_class.oid
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
LEFT JOIN pg_catalog.pg_attrdef AS column_default
  ON column_default.adrelid = table_class.oid
  AND column_default.adnum = attribute.attnum
WHERE namespace.nspname = $1
  AND table_class.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY table_class.relname, attribute.attnum
`

const indexesQuery = `
SELECT
  table_class.relname AS table_name,
  index_class.relname AS index_name,
  access_method.amname AS method,
  index_metadata.indisunique AS is_unique,
  index_metadata.indisprimary AS is_primary,
  pg_get_indexdef(index_metadata.indexrelid) AS definition,
  pg_get_expr(index_metadata.indpred, index_metadata.indrelid) AS predicate,
  pg_get_expr(index_metadata.indexprs, index_metadata.indrelid) AS expressions,
  index_metadata.indnatts > index_metadata.indnkeyatts AS has_included_columns,
  ARRAY(
    SELECT attribute.attname
    FROM unnest(index_metadata.indkey) WITH ORDINALITY AS key(attnum, position)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
      AND attribute.attnum = key.attnum
    WHERE key.position <= index_metadata.indnkeyatts
    ORDER BY key.position
  ) AS columns
FROM pg_catalog.pg_index AS index_metadata
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = index_metadata.indrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_class.relnamespace
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid = index_metadata.indexrelid
JOIN pg_catalog.pg_am AS access_method
  ON access_method.oid = index_class.relam
WHERE namespace.nspname = $1
ORDER BY table_class.relname, index_class.relname
`

const constraintsQuery = `
SELECT
  table_class.relname AS table_name,
  constraint_metadata.conname AS constraint_name,
  constraint_metadata.contype AS constraint_kind,
  pg_get_constraintdef(constraint_metadata.oid, true) AS definition,
  ARRAY(
    SELECT attribute.attname
    FROM unnest(constraint_metadata.conkey) WITH ORDINALITY AS key(attnum, position)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
      AND attribute.attnum = key.attnum
    ORDER BY key.position
  ) AS columns
FROM pg_catalog.pg_constraint AS constraint_metadata
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = constraint_metadata.conrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_class.relnamespace
WHERE namespace.nspname = $1
ORDER BY table_class.relname, constraint_metadata.conname
`

const readString = (
	record: Readonly<Record<string, unknown>>,
	key: string,
): string => {
	const value = record[key]

	if (typeof value !== 'string') {
		throw new TypeError(`PostgreSQL catalog ${key} must be a string`)
	}

	return value
}

const readOptionalString = (
	record: Readonly<Record<string, unknown>>,
	key: string,
): string | undefined => {
	const value = record[key]

	if (value === null || value === undefined || value === '') {
		return undefined
	}

	return readString(record, key)
}

const readBoolean = (
	record: Readonly<Record<string, unknown>>,
	key: string,
): boolean => {
	const value = record[key]

	if (typeof value !== 'boolean') {
		throw new TypeError(`PostgreSQL catalog ${key} must be a boolean`)
	}

	return value
}

const readStringArray = (
	record: Readonly<Record<string, unknown>>,
	key: string,
): readonly string[] => {
	const value = record[key]

	if (
		!isUnknownArray(value) ||
		!value.every((item) => typeof item === 'string')
	) {
		throw new TypeError(`PostgreSQL catalog ${key} must be a string list`)
	}

	return immutableArray(value)
}

const queryRows = async (
	pool: PostgresPool,
	query: string,
	namespace: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const result: unknown = await pool.query(query, [namespace])
	const rows = readPostgresQueryRows(result, 'PostgreSQL catalog query')

	return immutableArray(
		rows.map((row) => {
			if (!isPlainRecord(row)) {
				throw new TypeError('PostgreSQL catalog row must be a plain object')
			}

			return immutableRecord(row)
		}),
	)
}

const supportedTypePattern =
	/^(?:bigint|boolean|bytea|date|double precision|jsonb|numeric(?:\(\d+(?:,\s*\d+)?\))?|text|time(?:\(3\))?(?:(?: with| without) time zone)?|timestamp(?:\(3\))?(?:(?: with| without) time zone)?|uuid)$/u

const readIdentity = (
	value: string | undefined,
): PostgresIdentityKind | undefined => {
	if (value === undefined) return undefined
	if (value === 'a') return 'always'
	if (value === 'd') return 'byDefault'

	throw new TypeError(`Unknown PostgreSQL identity kind: ${value}`)
}

interface MutableTableSnapshot {
	readonly columns: PostgresColumnSnapshot[]
	readonly constraints: PostgresConstraintSnapshot[]
	readonly indexes: PostgresIndexSnapshot[]
	readonly managed: boolean
	readonly name: string
}

const getTable = (
	tables: Map<string, MutableTableSnapshot>,
	name: string,
	managedNames: ReadonlySet<string>,
): MutableTableSnapshot => {
	const existing = tables.get(name)

	if (existing !== undefined) {
		return existing
	}

	const table: MutableTableSnapshot = {
		columns: [],
		constraints: [],
		indexes: [],
		managed: managedNames.has(name),
		name,
	}

	tables.set(name, table)
	return table
}

const appendColumns = (
	rows: readonly Readonly<Record<string, unknown>>[],
	tables: Map<string, MutableTableSnapshot>,
	managedNames: ReadonlySet<string>,
	unsupported: PostgresUnsupportedStructure[],
): void => {
	for (const row of rows) {
		const tableName = readString(row, 'table_name')
		const tableWasKnown = tables.has(tableName)
		const table = getTable(tables, tableName, managedNames)
		const tableKind = readString(row, 'table_kind')

		// Relation metadata belongs to the table and must not repeat per column.
		if (!tableWasKnown) {
			if (tableKind === 'p') {
				unsupported.push({
					kind: 'partitioned-table',
					name: tableName,
					table: tableName,
				})
			} else if (tableKind !== 'r') {
				unsupported.push({
					kind: 'table-kind',
					name: tableName,
					table: tableName,
				})
			}
		}

		const columnName = readOptionalString(row, 'column_name')

		// PostgreSQL permits empty tables, which still belong in the snapshot.
		if (columnName === undefined) continue

		const dataType = readString(row, 'data_type')
		const defaultExpression = readOptionalString(row, 'default_expression')
		const identity = readIdentity(readOptionalString(row, 'identity_kind'))

		table.columns.push(
			immutableRecord({
				...(defaultExpression === undefined ? {} : { defaultExpression }),
				...(identity === undefined ? {} : { identity }),
				name: columnName,
				nullable: readBoolean(row, 'nullable'),
				type: dataType,
			}),
		)

		if (!supportedTypePattern.test(dataType)) {
			unsupported.push({
				kind: 'column-type',
				name: columnName,
				table: tableName,
			})
		}

		if (readOptionalString(row, 'generated_kind') !== undefined) {
			unsupported.push({
				kind: 'column-generated',
				name: columnName,
				table: tableName,
			})
		}
	}
}

const appendIndexes = (
	rows: readonly Readonly<Record<string, unknown>>[],
	tables: Map<string, MutableTableSnapshot>,
	managedNames: ReadonlySet<string>,
	unsupported: PostgresUnsupportedStructure[],
): void => {
	for (const row of rows) {
		const tableName = readString(row, 'table_name')
		const name = readString(row, 'index_name')
		const method = readString(row, 'method')

		getTable(tables, tableName, managedNames).indexes.push(
			immutableRecord({
				columns: readStringArray(row, 'columns'),
				definition: readString(row, 'definition'),
				method,
				name,
				primary: readBoolean(row, 'is_primary'),
				unique: readBoolean(row, 'is_unique'),
			}),
		)

		if (method !== 'btree')
			unsupported.push({ kind: 'index-method', name, table: tableName })
		if (readOptionalString(row, 'predicate') !== undefined)
			unsupported.push({ kind: 'index-partial', name, table: tableName })
		if (readOptionalString(row, 'expressions') !== undefined)
			unsupported.push({ kind: 'index-expression', name, table: tableName })
		if (readBoolean(row, 'has_included_columns'))
			unsupported.push({
				kind: 'index-included-columns',
				name,
				table: tableName,
			})
	}
}

const supportedConstraintKinds = new Set(['p', 'u'])

const appendConstraints = (
	rows: readonly Readonly<Record<string, unknown>>[],
	tables: Map<string, MutableTableSnapshot>,
	managedNames: ReadonlySet<string>,
	unsupported: PostgresUnsupportedStructure[],
): void => {
	for (const row of rows) {
		const tableName = readString(row, 'table_name')
		const name = readString(row, 'constraint_name')
		const kind = readString(row, 'constraint_kind')

		getTable(tables, tableName, managedNames).constraints.push(
			immutableRecord({
				columns: readStringArray(row, 'columns'),
				definition: readString(row, 'definition'),
				kind,
				name,
			}),
		)

		if (!supportedConstraintKinds.has(kind)) {
			unsupported.push({ kind: 'constraint-kind', name, table: tableName })
		}
	}
}

/** Reads a detached deterministic snapshot from PostgreSQL's system catalogs. */
export const introspectPostgresDatabase = async (
	pool: PostgresPool,
	namespace: string,
	managedTableNames: readonly string[],
): Promise<PostgresDatabaseSnapshot> => {
	assertNonEmptyString(namespace, 'PostgreSQL namespace')

	const managedNames = new Set(managedTableNames)
	const tables = new Map<string, MutableTableSnapshot>()
	const unsupported: PostgresUnsupportedStructure[] = []
	const [columnRows, indexRows, constraintRows] = await Promise.all([
		queryRows(pool, columnsQuery, namespace),
		queryRows(pool, indexesQuery, namespace),
		queryRows(pool, constraintsQuery, namespace),
	])

	appendColumns(columnRows, tables, managedNames, unsupported)
	appendIndexes(indexRows, tables, managedNames, unsupported)
	appendConstraints(constraintRows, tables, managedNames, unsupported)

	const snapshots: PostgresTableSnapshot[] = [...tables.values()]
		.sort((left, right) => left.name.localeCompare(right.name))
		.map((table) =>
			immutableRecord({
				columns: immutableArray(table.columns),
				constraints: immutableArray(table.constraints),
				indexes: immutableArray(table.indexes),
				managed: table.managed,
				name: table.name,
			}),
		)

	return immutableRecord({
		namespace,
		tables: immutableArray(snapshots),
		unsupported: immutableArray(
			unsupported.map((structure) => immutableRecord(structure)),
		),
	})
}
