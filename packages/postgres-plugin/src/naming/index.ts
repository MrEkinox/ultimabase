import { createPostgresIdentifier } from './identifier.js'

/** Generates one readable collision-resistant identifier within PostgreSQL's byte limit. */
export const createPostgresIndexName = (
	tableName: string,
	fields: readonly [string, ...string[]],
	unique: boolean,
): string => {
	const kind = unique ? 'uidx' : 'idx'
	const readable = `${tableName}_${fields.join('_')}_${kind}`

	return createPostgresIdentifier(readable, [
		tableName,
		unique ? 'unique' : 'ordinary',
		...fields,
	])
}
