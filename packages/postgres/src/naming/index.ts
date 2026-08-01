import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const postgresIdentifierByteLimit = 63
const fingerprintLength = 16

const truncateUtf8 = (value: string, maximumBytes: number): string => {
	const characters: string[] = []
	let byteLength = 0

	for (const character of value) {
		const characterBytes = Buffer.byteLength(character)

		if (byteLength + characterBytes > maximumBytes) {
			break
		}

		characters.push(character)
		byteLength += characterBytes
	}

	return characters.join('')
}

const createIndexFingerprint = (
	tableName: string,
	fields: readonly string[],
	unique: boolean,
): string => {
	const components = [tableName, unique ? 'unique' : 'ordinary', ...fields]
	const canonical = components
		.map((component) => `${String(Buffer.byteLength(component))}:${component}`)
		.join('|')

	return createHash('sha256')
		.update(canonical)
		.digest('hex')
		.slice(0, fingerprintLength)
}

/** Generates one readable collision-resistant identifier within PostgreSQL's byte limit. */
export const createPostgresIndexName = (
	tableName: string,
	fields: readonly [string, ...string[]],
	unique: boolean,
): string => {
	const kind = unique ? 'uidx' : 'idx'
	const readable = `${tableName}_${fields.join('_')}_${kind}`
	const fingerprint = createIndexFingerprint(tableName, fields, unique)
	const suffix = `_${fingerprint}`
	const prefix = truncateUtf8(
		readable,
		postgresIdentifierByteLimit - Buffer.byteLength(suffix),
	)

	return `${prefix}${suffix}`
}
