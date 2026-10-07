import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PostgresPool } from '../connection/contracts.js'
import { readPostgresQueryRows } from '../connection/query-result.js'
import { required } from '../required.js'
import type {
	PostgresColumnSnapshot,
	PostgresConstraintSnapshot,
	PostgresDatabaseSnapshot,
	PostgresForeignKeyAction,
	PostgresIdentityKind,
	PostgresIndexSnapshot,
	PostgresUnsupportedStructure,
	PostgresUnsupportedStructureKind,
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

// `pg` does not parse PostgreSQL's `name[]` type, so catalog names must become `text[]`.
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
    SELECT attribute.attname::text
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
  constraint_metadata.confdeltype AS delete_action,
  pg_get_constraintdef(constraint_metadata.oid, true) AS definition,
  referenced_class.relname AS target_table,
  ARRAY(
    SELECT attribute.attname::text
    FROM unnest(constraint_metadata.conkey) WITH ORDINALITY AS key(attnum, position)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
      AND attribute.attnum = key.attnum
    ORDER BY key.position
  ) AS columns,
  ARRAY(
    SELECT attribute.attname::text
    FROM unnest(constraint_metadata.confkey) WITH ORDINALITY AS key(attnum, position)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = constraint_metadata.confrelid
      AND attribute.attnum = key.attnum
    ORDER BY key.position
  ) AS target_columns
FROM pg_catalog.pg_constraint AS constraint_metadata
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = constraint_metadata.conrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_class.relnamespace
LEFT JOIN pg_catalog.pg_class AS referenced_class
  ON referenced_class.oid = constraint_metadata.confrelid
WHERE namespace.nspname = $1
ORDER BY table_class.relname, constraint_metadata.conname
`

type CatalogRow = Readonly<Record<string, unknown>>

const readString = (row: CatalogRow, key: string): string => {
	const value = row[key]

	if (typeof value !== 'string') {
		throw new TypeError(`PostgreSQL catalog ${key} must be a string`)
	}

	return value
}

/** Treats SQL NULL and PostgreSQL's empty catalog codes as absent. */
const readOptionalString = (
	row: CatalogRow,
	key: string,
): string | undefined => {
	const value = row[key]

	return value === null || value === undefined || value === ''
		? undefined
		: readString(row, key)
}

const readBoolean = (row: CatalogRow, key: string): boolean => {
	const value = row[key]

	if (typeof value !== 'boolean') {
		throw new TypeError(`PostgreSQL catalog ${key} must be a boolean`)
	}

	return value
}

const readStringArray = (row: CatalogRow, key: string): readonly string[] => {
	const value = row[key]

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
): Promise<readonly CatalogRow[]> => {
	const result: unknown = await pool.query(query, [namespace])

	return readPostgresQueryRows(result, 'PostgreSQL catalog query').map(
		(row) => {
			if (!isPlainRecord(row)) {
				throw new TypeError('PostgreSQL catalog row must be a plain object')
			}

			return immutableRecord(row)
		},
	)
}

const supportedTypePattern =
	/^(?:bigint|boolean|bytea|date|double precision|jsonb|numeric(?:\(\d+(?:,\s*\d+)?\))?|text|time(?:\(3\))?(?:(?: with| without) time zone)?|timestamp(?:\(3\))?(?:(?: with| without) time zone)?|uuid)$/u

const identityKinds = new Map<string, PostgresIdentityKind>([
	['a', 'always'],
	['d', 'byDefault'],
])

const foreignKeyActions = new Map<string, PostgresForeignKeyAction>([
	['a', 'noAction'],
	['c', 'cascade'],
	['d', 'setDefault'],
	['n', 'setNull'],
	['r', 'restrict'],
])

const supportedConstraintKinds = new Set(['f', 'p', 'u'])

interface MutableTableSnapshot {
	readonly columns: PostgresColumnSnapshot[]
	readonly constraints: PostgresConstraintSnapshot[]
	readonly indexes: PostgresIndexSnapshot[]
	readonly managed: boolean
	readonly name: string
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
	const getTable = (name: string): MutableTableSnapshot => {
		const table = tables.get(name) ?? {
			columns: [],
			constraints: [],
			indexes: [],
			managed: managedNames.has(name),
			name,
		}

		tables.set(name, table)
		return table
	}
	const reject = (
		kind: PostgresUnsupportedStructureKind,
		name: string,
		table: string,
	): void => {
		unsupported.push({ kind, name, table })
	}

	for (const row of columnRows) {
		const tableName = readString(row, 'table_name')
		const tableWasKnown = tables.has(tableName)
		const table = getTable(tableName)
		const tableKind = readString(row, 'table_kind')

		// Relation metadata belongs to the table and must not repeat per column.
		if (!tableWasKnown && tableKind !== 'r') {
			reject(
				tableKind === 'p' ? 'partitioned-table' : 'table-kind',
				tableName,
				tableName,
			)
		}

		const columnName = readOptionalString(row, 'column_name')

		// PostgreSQL permits empty tables, which still belong in the snapshot.
		if (columnName === undefined) continue

		const dataType = readString(row, 'data_type')
		const defaultExpression = readOptionalString(row, 'default_expression')
		const identityCode = readOptionalString(row, 'identity_kind')
		const identity =
			identityCode === undefined
				? undefined
				: required(
						identityKinds.get(identityCode),
						`Unknown PostgreSQL identity kind: ${identityCode}`,
					)

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
			reject('column-type', columnName, tableName)
		}

		if (readOptionalString(row, 'generated_kind') !== undefined) {
			reject('column-generated', columnName, tableName)
		}
	}

	for (const row of indexRows) {
		const tableName = readString(row, 'table_name')
		const name = readString(row, 'index_name')
		const method = readString(row, 'method')

		getTable(tableName).indexes.push(
			immutableRecord({
				columns: readStringArray(row, 'columns'),
				definition: readString(row, 'definition'),
				method,
				name,
				primary: readBoolean(row, 'is_primary'),
				unique: readBoolean(row, 'is_unique'),
			}),
		)

		if (method !== 'btree' && method !== 'gin') {
			reject('index-method', name, tableName)
		}
		if (readOptionalString(row, 'predicate') !== undefined) {
			reject('index-partial', name, tableName)
		}
		if (readOptionalString(row, 'expressions') !== undefined) {
			reject('index-expression', name, tableName)
		}
		if (readBoolean(row, 'has_included_columns')) {
			reject('index-included-columns', name, tableName)
		}
	}

	for (const row of constraintRows) {
		const tableName = readString(row, 'table_name')
		const name = readString(row, 'constraint_name')
		const kind = readString(row, 'constraint_kind')
		const deleteAction =
			kind === 'f' ? readString(row, 'delete_action') : undefined
		const foreignKey =
			deleteAction === undefined
				? {}
				: {
						onDelete: required(
							foreignKeyActions.get(deleteAction),
							`Unknown PostgreSQL foreign-key action: ${deleteAction}`,
						),
						targetColumns: readStringArray(row, 'target_columns'),
						targetTable: readString(row, 'target_table'),
					}

		getTable(tableName).constraints.push(
			immutableRecord({
				columns: readStringArray(row, 'columns'),
				definition: readString(row, 'definition'),
				kind,
				name,
				...foreignKey,
			}),
		)

		if (!supportedConstraintKinds.has(kind)) {
			reject('constraint-kind', name, tableName)
		}
	}

	return immutableRecord({
		namespace,
		tables: immutableArray(
			[...tables.values()]
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((table) =>
					immutableRecord({
						columns: immutableArray(table.columns),
						constraints: immutableArray(table.constraints),
						indexes: immutableArray(table.indexes),
						managed: table.managed,
						name: table.name,
					}),
				),
		),
		unsupported: immutableArray(
			unsupported.map((structure) => immutableRecord(structure)),
		),
	})
}
