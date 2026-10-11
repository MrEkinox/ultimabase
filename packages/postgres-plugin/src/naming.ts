import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const postgresIdentifierByteLimit = 63

/**
 * Derives the default physical column of one field in `snake_case`, like table
 * names (ADR-0320): `createdAt` → `created_at`, `userID` → `user_id`,
 * `URLValue` → `url_value`. Names without capitals are kept as they are.
 */
export const toPostgresColumnName = (fieldName: string): string =>
	fieldName
		.replaceAll(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1_$2')
		.replaceAll(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1_$2')
		.toLowerCase()

/** Rejects two fields of one table whose default column names coincide. */
export const assertDistinctPostgresColumns = (
	owner: string,
	fieldNames: Iterable<string>,
): void => {
	const fieldByColumn = new Map<string, string>()

	for (const fieldName of fieldNames) {
		const column = toPostgresColumnName(fieldName)
		const other = fieldByColumn.get(column)

		if (other !== undefined) {
			throw new TypeError(
				`PostgreSQL fields ${owner}.${other} and ${owner}.${fieldName} both map to column "${column}"; rename one of them.`,
			)
		}

		fieldByColumn.set(column, fieldName)
	}
}

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
