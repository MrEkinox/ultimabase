import type { PostgresSchemaChange } from './contracts.js'

const quote = (name: string): string => `"${name}"`
const column = (table: string, name: string): string =>
	`${quote(table)}.${quote(name)}`

/**
 * Describes one planned change with physical names and types only, so startup
 * errors can name what differs without exposing row values or driver text.
 */
export const describePostgresSchemaChange = (
	change: PostgresSchemaChange,
): string => {
	switch (change.kind) {
		case 'create-table':
			return `create table ${quote(change.table.name)}`
		case 'add-column':
			return `add column ${column(change.table, change.column.name)} (${change.column.type}, ${change.column.nullable ? 'optional' : 'required'})`
		case 'add-foreign-key':
			return `add foreign key ${column(change.table, change.foreignKey.column)} -> ${column(change.foreignKey.targetTable, change.foreignKey.targetColumn)}`
		case 'rename-column':
			return `rename column ${column(change.table, change.from)} to ${quote(change.to)}`
		case 'alter-column-type':
			return `change type of ${column(change.table, change.column)} from ${change.from} to ${change.to}`
		case 'set-column-nullability':
			return `make ${column(change.table, change.column)} ${change.nullable ? 'optional' : 'required'}`
		case 'set-column-default':
			return change.expression === undefined
				? `drop default of ${column(change.table, change.column)}`
				: `set default of ${column(change.table, change.column)}`
		case 'set-column-identity':
			return change.identity === undefined
				? `drop identity of ${column(change.table, change.column)}`
				: `set identity of ${column(change.table, change.column)}`
		case 'drop-column':
			return `drop column ${column(change.table, change.column)}`
		case 'create-index':
			return `create index ${quote(change.index.name)} on ${quote(change.table)}`
		case 'drop-index':
			return `drop index ${quote(change.index)} on ${quote(change.table)}`
		case 'drop-constraint':
			return `drop constraint ${quote(change.constraint)} on ${quote(change.table)}`
		case 'set-primary-key':
			return `set primary key of ${quote(change.table)} to (${change.columns.map(quote).join(', ')})`
		case 'unsupported-structure':
			return `unsupported structure on ${quote(change.table)}: ${change.structure}`
	}
}

const listedChanges = 10

/** Lists the first changes in plan order and counts the rest. */
export const summarizePostgresSchemaChanges = (
	changes: readonly PostgresSchemaChange[],
): string => {
	const listed = changes
		.slice(0, listedChanges)
		.map(describePostgresSchemaChange)
		.join('; ')
	const remaining = changes.length - listedChanges

	return remaining > 0 ? `${listed}; and ${String(remaining)} more` : listed
}

// SQLSTATE 23502: existing rows violate a new NOT NULL column or constraint.
const notNullViolation = '23502'

/** Explains the one failure developers hit when a stored field becomes required. */
export const explainPostgresSynchronizationFailure = (
	change: PostgresSchemaChange,
	driverCode: string | undefined,
): string => {
	const required =
		(change.kind === 'add-column' && !change.column.nullable) ||
		(change.kind === 'set-column-nullability' && !change.nullable)
	return driverCode === notNullViolation && required
		? ' Existing rows have no value for this required column: make it optional or give it a default first, and use `postgres: { renamedFrom }` when the field was renamed.'
		: ''
}
