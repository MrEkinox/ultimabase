import { FrameworkError } from '../../errors/framework-error.js'

/**
 * Validates the portable regular-expression subset every database adapter
 * executes identically (ADR-0302): literals, `.`, bracket classes with ranges
 * and negation, `\d \w \s` and their negations, anchors, plain and
 * non-capturing groups, alternation and the quantifiers `* + ? {m} {m,} {m,n}`.
 * Backreferences, lookaround, named groups, Unicode properties, lazy
 * quantifiers and every other escape are rejected before the adapter.
 */

const classEscapes = new Set(['d', 'D', 'w', 'W', 's', 'S'])
const escapableCharacters = new Set([
	'\\',
	'^',
	'$',
	'.',
	'|',
	'?',
	'*',
	'+',
	'(',
	')',
	'[',
	']',
	'{',
	'}',
	'/',
	'-',
])
const quantifierPattern = /^\{(\d+)(,(\d*))?\}/

const unsupported = (field: string, construct: string): FrameworkError =>
	new FrameworkError(
		'VALIDATION_ERROR',
		`Regular expression on ${field} uses ${construct}, outside the portable subset.`,
		{
			publicMessage: `The regular expression on ${field} uses ${construct}, which is not supported.`,
			publicDetails: { field, operator: 'matches' },
			internalDetails: { kind: 'query-regex-not-portable' },
		},
	)

/** Reads one escape at `index` (the backslash) and returns the next index. */
const readEscape = (source: string, index: number, field: string): number => {
	const next = source[index + 1]
	if (next === undefined) throw unsupported(field, 'a trailing backslash')
	if (!classEscapes.has(next) && !escapableCharacters.has(next)) {
		throw unsupported(field, `the escape \\${next}`)
	}
	return index + 2
}

/** Reads one bracket class starting at `[` and returns the index after `]`. */
const readClass = (source: string, start: number, field: string): number => {
	let index = start + 1
	if (source[index] === '^') index += 1
	let members = 0
	for (;;) {
		const character = source[index]
		if (character === undefined) {
			throw unsupported(field, 'an unterminated bracket class')
		}
		if (character === ']') {
			if (members === 0) throw unsupported(field, 'an empty bracket class')
			return index + 1
		}
		if (character === '[' && ':=.'.includes(source[index + 1] ?? '')) {
			throw unsupported(field, 'a POSIX bracket expression')
		}
		index = character === '\\' ? readEscape(source, index, field) : index + 1
		members += 1
	}
}

/**
 * Throws a public `VALIDATION_ERROR` naming the field when `source` leaves the
 * portable subset; the pattern itself never appears in the error.
 */
export const assertPortableRegexSource = (
	source: string,
	field: string,
): void => {
	let depth = 0
	// Whether the previous token can take a quantifier.
	let quantifiable = false
	let index = 0
	while (index < source.length) {
		const character = source[index] ?? ''
		switch (character) {
			case '\\':
				index = readEscape(source, index, field)
				quantifiable = true
				break
			case '[':
				index = readClass(source, index, field)
				quantifiable = true
				break
			case '(':
				if (source[index + 1] === '?') {
					if (source[index + 2] !== ':') {
						throw unsupported(field, 'lookaround or a named group')
					}
					index += 3
				} else {
					index += 1
				}
				depth += 1
				quantifiable = false
				break
			case ')':
				if (depth === 0) throw unsupported(field, 'an unbalanced parenthesis')
				depth -= 1
				index += 1
				quantifiable = true
				break
			case '*':
			case '+':
			case '?':
			case '{': {
				const bounded =
					character === '{' ? quantifierPattern.exec(source.slice(index)) : null
				if (character === '{' && bounded === null) {
					throw unsupported(field, 'a malformed repetition')
				}
				if (!quantifiable) {
					throw unsupported(field, 'a quantifier without a target')
				}
				const [, minimum, , maximum] = bounded ?? []
				if (
					minimum !== undefined &&
					maximum !== undefined &&
					maximum !== '' &&
					Number(maximum) < Number(minimum)
				) {
					throw unsupported(field, 'an inverted repetition range')
				}
				index += bounded?.[0].length ?? 1
				// A second quantifier (lazy or possessive form) has no target.
				quantifiable = false
				break
			}
			case '|':
			case '^':
			case '$':
				index += 1
				quantifiable = false
				break
			case ']':
			case '}':
				throw unsupported(field, `an unescaped ${character}`)
			default:
				index += 1
				quantifiable = true
		}
	}
	if (depth !== 0) throw unsupported(field, 'an unbalanced parenthesis')
}
