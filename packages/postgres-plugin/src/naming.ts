import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const postgresIdentifierByteLimit = 63

/** Keeps every generated PostgreSQL identifier stable, distinct, and UTF-8 safe. */
const createPostgresIdentifier = (
	readable: string,
	components: readonly string[],
): string => {
	// Length-prefixed components keep `a_b` + `c` distinct from `a` + `b_c`.
	const canonical = components
		.map((component) => `${String(Buffer.byteLength(component))}:${component}`)
		.join('|')
	const suffix = `_${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`
	let prefix = ''

	// Truncate on complete code points because PostgreSQL limits encoded bytes.
	for (const character of readable) {
		const candidate = `${prefix}${character}`

		if (Buffer.byteLength(candidate + suffix) > postgresIdentifierByteLimit) {
			break
		}

		prefix = candidate
	}

	return `${prefix}${suffix}`
}

/** Generates one readable collision-resistant identifier within PostgreSQL's byte limit. */
export const createPostgresIndexName = (
	tableName: string,
	fields: readonly string[],
	unique: boolean,
	predicate?: string,
): string =>
	createPostgresIdentifier(
		`${tableName}_${fields.join('_')}_${predicate === undefined ? '' : 'p'}${unique ? 'uidx' : 'idx'}`,
		[
			tableName,
			unique ? 'unique' : 'ordinary',
			...fields,
			// A changed predicate yields a new name, so synchronization replaces it.
			...(predicate === undefined ? [] : ['where', predicate]),
		],
	)

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
