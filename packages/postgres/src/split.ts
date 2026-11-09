// The statements of a migration file, as PostgreSQL tells them apart, to
// name the statement each count of a deploy belongs to (D-344).

/** Whether `char` may continue an identifier, so that `$` there is no quote. */
const word = (char: string | undefined) =>
	char !== undefined && /[\w$\u0080-￿]/u.test(char)

/** Where the quoted text opened at `at` with `quote` ends. */
function quoted(text: string, at: number, quote: string, escapes: boolean) {
	let next = at + 1
	while (next < text.length) {
		const char = text[next]
		if (escapes && char === '\\') next += 2
		else if (char !== quote) next += 1
		else if (text[next + 1] === quote) next += 2
		else return next + 1
	}
	return next
}

/** Where the comment `/*` at `at` ends; they nest. */
function block(text: string, at: number) {
	let depth = 0
	let next = at
	while (next < text.length) {
		if (text.startsWith('/*', next)) {
			depth += 1
			next += 2
		} else if (text.startsWith('*/', next)) {
			depth -= 1
			next += 2
			if (depth === 0) return next
		} else next += 1
	}
	return next
}

/** Where the token at `at` ends: a quote, a comment or a character. */
function passed(text: string, at: number): number {
	const char = text[at] ?? ''
	if (text.startsWith('--', at)) {
		const end = text.indexOf('\n', at)
		return end === -1 ? text.length : end + 1
	}
	if (text.startsWith('/*', at)) return block(text, at)
	if (char === '"') return quoted(text, at, '"', false)
	if (char === "'") {
		const escapes = /[eE]/u.test(text[at - 1] ?? '') && !word(text[at - 2])
		return quoted(text, at, "'", escapes)
	}
	if (char === '$' && !word(text[at - 1])) {
		const tag = /^\$(?:[A-Za-z_\u0080-￿][\w\u0080-￿]*)?\$/u.exec(
			text.slice(at, at + 64),
		)?.[0]
		if (tag !== undefined) {
			const end = text.indexOf(tag, at + tag.length)
			return end === -1 ? text.length : end + tag.length
		}
	}
	return at + 1
}

/** `text` from its first token on: blanks and comments before it dropped. */
function started(text: string): string {
	let at = 0
	while (at < text.length) {
		if (/\s/u.test(text[at] ?? '')) at += 1
		else if (text.startsWith('--', at) || text.startsWith('/*', at)) {
			at = passed(text, at)
		} else break
	}
	return text.slice(at).trimEnd()
}

/**
 * The statements of `text`, in order, without their semicolon: those that
 * hold only blanks and comments, which PostgreSQL answers with nothing, are
 * left out.
 */
export function split(text: string): string[] {
	const found: string[] = []
	let start = 0
	let at = 0
	const end = () => {
		const statement = started(text.slice(start, at))
		if (statement !== '') found.push(statement)
		start = at + 1
	}
	while (at < text.length) {
		if (text[at] === ';') {
			end()
			at += 1
		} else at = passed(text, at)
	}
	end()
	return found
}
