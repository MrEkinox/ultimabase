import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const postgresIdentifierByteLimit = 63
const fingerprintLength = 16

const truncateUtf8 = (value: string, maximumBytes: number): string => {
	const characters: string[] = []
	let byteLength = 0

	for (const character of value) {
		const characterBytes = Buffer.byteLength(character)

		if (byteLength + characterBytes > maximumBytes) break

		characters.push(character)
		byteLength += characterBytes
	}

	return characters.join('')
}

const createIdentifierFingerprint = (components: readonly string[]): string => {
	const canonical = components
		.map((component) => `${String(Buffer.byteLength(component))}:${component}`)
		.join('|')

	return createHash('sha256')
		.update(canonical)
		.digest('hex')
		.slice(0, fingerprintLength)
}

/** Keeps every generated PostgreSQL identifier stable, distinct, and UTF-8 safe. */
export const createPostgresIdentifier = (
	readable: string,
	components: readonly string[],
): string => {
	const fingerprint = createIdentifierFingerprint(components)
	const suffix = `_${fingerprint}`
	const prefix = truncateUtf8(
		readable,
		postgresIdentifierByteLimit - Buffer.byteLength(suffix),
	)

	return `${prefix}${suffix}`
}
