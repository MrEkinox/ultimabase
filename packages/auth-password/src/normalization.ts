const usernameEdge = /^[\p{L}\p{N}]$/u
const usernameCharacter = /^[\p{L}\p{N}._-]$/u
const edgeWhitespace = /^\p{White_Space}+|\p{White_Space}+$/gu
// A pragmatic address check: one `@`, no spaces, a dotted domain.
const emailPattern = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/u

const assertWellFormedUnicode = (value: string, path: string): void => {
	if (!value.isWellFormed()) {
		throw new TypeError(`${path} must contain well-formed Unicode`)
	}
}

/** Normalizes one username into its only stored representation. */
export const normalizeUsername = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('username must be a string')
	}
	assertWellFormedUnicode(value, 'username')
	const normalized = value
		.replace(edgeWhitespace, '')
		.normalize('NFKC')
		.toLowerCase()
	const characters = Array.from(normalized)
	if (characters.length < 3 || characters.length > 64) {
		throw new TypeError(
			'username must contain between 3 and 64 Unicode code points',
		)
	}
	if (
		!usernameEdge.test(characters[0] ?? '') ||
		!usernameEdge.test(characters.at(-1) ?? '') ||
		characters.some((character) => !usernameCharacter.test(character))
	) {
		throw new TypeError('username has an invalid format')
	}
	return normalized
}

/** Normalizes one email address into its only stored representation. */
export const normalizeEmail = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('email must be a string')
	}
	assertWellFormedUnicode(value, 'email')
	const normalized = value
		.replace(edgeWhitespace, '')
		.normalize('NFKC')
		.toLowerCase()
	if (normalized.length > 254 || !emailPattern.test(normalized)) {
		throw new TypeError('email must be a valid email address')
	}
	return normalized
}

/** Normalizes one ephemeral password without trimming or changing its case. */
export const normalizePassword = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('password must be a string')
	}
	assertWellFormedUnicode(value, 'password')
	const normalized = value.normalize('NFC')
	const length = Array.from(normalized).length
	if (length < 15 || length > 256) {
		throw new TypeError(
			'password must contain between 15 and 256 Unicode code points',
		)
	}
	return normalized
}
