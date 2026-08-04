import { createPostgresIdentifier } from './identifier.js'

/** Names one owning relation table without relying on PostgreSQL truncation. */
export const createPostgresRelationTableName = (
	sourceTable: string,
	fieldName: string,
	targetTable: string,
): string =>
	createPostgresIdentifier(
		`${sourceTable}_${fieldName}_${targetTable}_relation`,
		[sourceTable, fieldName, targetTable, 'relation-table'],
	)
