import { immutableArray } from '@ultimabase/shared'

import type {
	DesiredPostgresColumn,
	DesiredPostgresForeignKey,
	DesiredPostgresIndex,
	DesiredPostgresTable,
	PostgresSchemaChange,
} from './contracts.js'

const quoteIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`

const qualify = (namespace: string, name: string): string =>
	`${quoteIdentifier(namespace)}.${quoteIdentifier(name)}`

const renderIdentity = (
	identity: DesiredPostgresColumn['identity'],
): string | undefined =>
	identity === undefined
		? undefined
		: `GENERATED ${identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`

const renderColumn = (column: DesiredPostgresColumn): string =>
	[
		quoteIdentifier(column.name),
		column.type,
		renderIdentity(column.identity),
		column.defaultExpression === undefined
			? undefined
			: `DEFAULT ${column.defaultExpression}`,
		column.nullable ? undefined : 'NOT NULL',
		column.primary ? 'PRIMARY KEY' : undefined,
	]
		.filter((fragment): fragment is string => fragment !== undefined)
		.join(' ')

const renderCreateTable = (
	namespace: string,
	table: DesiredPostgresTable,
): string =>
	`CREATE TABLE ${qualify(namespace, table.name)} (${table.columns.map(renderColumn).join(', ')})`

const renderCreateIndex = (
	namespace: string,
	table: string,
	index: DesiredPostgresIndex,
): string =>
	`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(index.name)} ON ${qualify(namespace, table)}${index.method === 'gin' ? ' USING gin' : ''} (${index.columns.map(quoteIdentifier).join(', ')})`

const renderForeignKeyAction = (
	action: DesiredPostgresForeignKey['onDelete'],
): string => (action === 'setNull' ? 'SET NULL' : action.toUpperCase())

const renderAddForeignKey = (
	namespace: string,
	table: string,
	foreignKey: DesiredPostgresForeignKey,
): string =>
	`ALTER TABLE ${qualify(namespace, table)} ADD CONSTRAINT ${quoteIdentifier(foreignKey.name)} FOREIGN KEY (${quoteIdentifier(foreignKey.column)}) REFERENCES ${qualify(namespace, foreignKey.targetTable)} (${quoteIdentifier(foreignKey.targetColumn)}) ON DELETE ${renderForeignKeyAction(foreignKey.onDelete)}`

/** Renders one validated plan without interpolating unescaped identifiers. */
export const renderPostgresSchemaChange = (
	namespace: string,
	change: PostgresSchemaChange,
): readonly string[] => {
	switch (change.kind) {
		case 'create-table':
			return immutableArray([
				renderCreateTable(namespace, change.table),
				...change.table.indexes.map((index) =>
					renderCreateIndex(namespace, change.table.name, index),
				),
			])
		case 'add-column':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} ADD COLUMN ${renderColumn(change.column)}`,
			])
		case 'add-foreign-key':
			return immutableArray([
				renderAddForeignKey(namespace, change.table, change.foreignKey),
			])
		case 'rename-column':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} RENAME COLUMN ${quoteIdentifier(change.from)} TO ${quoteIdentifier(change.to)}`,
			])
		case 'alter-column-type':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} ALTER COLUMN ${quoteIdentifier(change.column)} TYPE ${change.to} USING ${quoteIdentifier(change.column)}::${change.to}`,
			])
		case 'set-column-nullability':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} ALTER COLUMN ${quoteIdentifier(change.column)} ${change.nullable ? 'DROP' : 'SET'} NOT NULL`,
			])
		case 'set-column-default':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} ALTER COLUMN ${quoteIdentifier(change.column)} ${change.expression === undefined ? 'DROP DEFAULT' : `SET DEFAULT ${change.expression}`}`,
			])
		case 'set-column-identity':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} ALTER COLUMN ${quoteIdentifier(change.column)} ${
					change.identity === undefined
						? 'DROP IDENTITY IF EXISTS'
						: `ADD GENERATED ${change.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`
				}`,
			])
		case 'drop-column':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} DROP COLUMN ${quoteIdentifier(change.column)}`,
			])
		case 'create-index':
			return immutableArray([
				renderCreateIndex(namespace, change.table, change.index),
			])
		case 'drop-index':
			return immutableArray([`DROP INDEX ${qualify(namespace, change.index)}`])
		case 'drop-constraint':
			return immutableArray([
				`ALTER TABLE ${qualify(namespace, change.table)} DROP CONSTRAINT ${quoteIdentifier(change.constraint)}`,
			])
		case 'set-primary-key':
			return immutableArray([
				...(change.currentConstraint === undefined
					? []
					: [
							`ALTER TABLE ${qualify(namespace, change.table)} DROP CONSTRAINT ${quoteIdentifier(change.currentConstraint)}`,
						]),
				`ALTER TABLE ${qualify(namespace, change.table)} ADD PRIMARY KEY (${change.columns.map(quoteIdentifier).join(', ')})`,
			])
		case 'unsupported-structure':
			return immutableArray([])
	}
}
