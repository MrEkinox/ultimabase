import { immutableArray } from '@ultimabase/shared'

import type {
	DesiredPostgresColumn,
	DesiredPostgresIndex,
	PostgresSchemaChange,
} from './contracts.js'

const quoteIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`

const qualify = (namespace: string, name: string): string =>
	`${quoteIdentifier(namespace)}.${quoteIdentifier(name)}`

const renderIdentity = (identity: 'always' | 'byDefault'): string =>
	`GENERATED ${identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`

const renderColumn = (column: DesiredPostgresColumn): string =>
	[
		quoteIdentifier(column.name),
		column.type,
		column.identity === undefined ? undefined : renderIdentity(column.identity),
		column.defaultExpression === undefined
			? undefined
			: `DEFAULT ${column.defaultExpression}`,
		column.nullable ? undefined : 'NOT NULL',
		column.primary ? 'PRIMARY KEY' : undefined,
	]
		.filter((fragment): fragment is string => fragment !== undefined)
		.join(' ')

const renderCreateIndex = (
	namespace: string,
	table: string,
	index: DesiredPostgresIndex,
): string =>
	`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(index.name)} ON ${qualify(namespace, table)}${index.method === 'gin' ? ' USING gin' : ''} (${index.columns.map(quoteIdentifier).join(', ')})${index.predicate === undefined ? '' : ` WHERE ${index.predicate}`}`

/** Renders one validated plan without interpolating unescaped identifiers. */
export const renderPostgresSchemaChange = (
	namespace: string,
	change: PostgresSchemaChange,
): readonly string[] => {
	if (change.kind === 'create-table') {
		const { columns, indexes, name } = change.table

		return immutableArray([
			`CREATE TABLE ${qualify(namespace, name)} (${columns.map(renderColumn).join(', ')})`,
			...indexes.map((index) => renderCreateIndex(namespace, name, index)),
		])
	}

	const table = `ALTER TABLE ${qualify(namespace, change.table)}`
	const column = (name: string): string =>
		`${table} ALTER COLUMN ${quoteIdentifier(name)}`

	switch (change.kind) {
		case 'add-column':
			return immutableArray([
				`${table} ADD COLUMN ${renderColumn(change.column)}`,
			])
		case 'add-foreign-key': {
			const { foreignKey } = change
			const action =
				foreignKey.onDelete === 'setNull'
					? 'SET NULL'
					: foreignKey.onDelete.toUpperCase()

			return immutableArray([
				`${table} ADD CONSTRAINT ${quoteIdentifier(foreignKey.name)} FOREIGN KEY (${quoteIdentifier(foreignKey.column)}) REFERENCES ${qualify(namespace, foreignKey.targetTable)} (${quoteIdentifier(foreignKey.targetColumn)}) ON DELETE ${action}`,
			])
		}
		case 'rename-column':
			return immutableArray([
				`${table} RENAME COLUMN ${quoteIdentifier(change.from)} TO ${quoteIdentifier(change.to)}`,
			])
		case 'alter-column-type':
			return immutableArray([
				`${column(change.column)} TYPE ${change.to} USING ${quoteIdentifier(change.column)}::${change.to}`,
			])
		case 'set-column-nullability':
			return immutableArray([
				`${column(change.column)} ${change.nullable ? 'DROP' : 'SET'} NOT NULL`,
			])
		case 'set-column-default':
			return immutableArray([
				`${column(change.column)} ${change.expression === undefined ? 'DROP DEFAULT' : `SET DEFAULT ${change.expression}`}`,
			])
		case 'set-column-identity':
			return immutableArray([
				`${column(change.column)} ${change.identity === undefined ? 'DROP IDENTITY IF EXISTS' : `ADD ${renderIdentity(change.identity)}`}`,
			])
		case 'drop-column':
			return immutableArray([
				`${table} DROP COLUMN ${quoteIdentifier(change.column)}`,
			])
		case 'create-index':
			return immutableArray([
				renderCreateIndex(namespace, change.table, change.index),
			])
		case 'drop-index':
			return immutableArray([`DROP INDEX ${qualify(namespace, change.index)}`])
		case 'drop-constraint':
			return immutableArray([
				`${table} DROP CONSTRAINT ${quoteIdentifier(change.constraint)}`,
			])
		case 'set-primary-key':
			return immutableArray([
				...(change.currentConstraint === undefined
					? []
					: [
							`${table} DROP CONSTRAINT ${quoteIdentifier(change.currentConstraint)}`,
						]),
				`${table} ADD PRIMARY KEY (${change.columns.map(quoteIdentifier).join(', ')})`,
			])
		case 'unsupported-structure':
			return immutableArray([])
	}
}
