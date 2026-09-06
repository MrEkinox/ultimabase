const usernameEdge = /^[\p{L}\p{N}]$/u
const usernameCharacter = /^[\p{L}\p{N}._-]$/u
const usernameEdgeWhitespace = /^\p{White_Space}+|\p{White_Space}+$/gu

const assertWellFormedUnicode = (value: string, path: string): void => {
	if (!value.isWellFormed()) {
		throw new TypeError(`${path} must contain well-formed Unicode`)
	}
}

/** Normalizes one local username into its only persisted representation. */
export const normalizePasswordUsername = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('Password Auth username must be a string')
	}
	assertWellFormedUnicode(value, 'Password Auth username')
	const normalized = value
		.replace(usernameEdgeWhitespace, '')
		.normalize('NFKC')
		.toLowerCase()
	const characters = Array.from(normalized)

	if (characters.length < 3 || characters.length > 64) {
		throw new TypeError(
			'Password Auth username must contain between 3 and 64 Unicode code points',
		)
	}
	if (
		!usernameEdge.test(characters[0] ?? '') ||
		!usernameEdge.test(characters.at(-1) ?? '') ||
		characters.some((character) => !usernameCharacter.test(character))
	) {
		throw new TypeError('Password Auth username has an invalid format')
	}

	return normalized
}

/** Normalizes one ephemeral password without trimming or changing its case. */
export const normalizePasswordInput = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('Password Auth password must be a string')
	}
	assertWellFormedUnicode(value, 'Password Auth password')
	const normalized = value.normalize('NFC')
	const length = Array.from(normalized).length

	if (length < 15 || length > 256) {
		throw new TypeError(
			'Password Auth password must contain between 15 and 256 Unicode code points',
		)
	}

	return normalized
}
