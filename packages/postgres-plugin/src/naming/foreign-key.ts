import { createPostgresIdentifier } from './identifier.js'

/** Names one managed pointer constraint without relying on PostgreSQL truncation. */
export const createPostgresForeignKeyName = (
	sourceTable: string,
	sourceColumn: string,
	targetTable: string,
	targetColumn: string,
): string =>
	createPostgresIdentifier(
		`${sourceTable}_${sourceColumn}_${targetTable}_${targetColumn}_fk`,
		[sourceTable, sourceColumn, targetTable, targetColumn, 'foreign-key'],
	)
