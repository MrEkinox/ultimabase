// `memory()`'s full-text search (D-148), close to PostgreSQL's 'simple'
// configuration: a word is a run of letters and digits, lowered, with no
// stop words and no stems; the relevance follows `ts_rank`'s formulas.
import type { SchemaField } from './adapter.ts'
import { searchedFields } from './query-search.ts'

/** A word or a phrase, each `-` before it negating it. */
type Term = { readonly words: readonly string[]; readonly minus: number }

/** Each word of a document and its positions, from 1. */
type Document = ReadonlyMap<string, readonly number[]>

type Fields = ReadonlyMap<string, SchemaField> | undefined

const words = (text: string): string[] =>
	text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** A quoted phrase, a `-`, an `or`, or a word and what follows it to a space. */
const tokens = /"([^"]*)"?|-|or(?![\p{L}\p{N}])|[\p{L}\p{N}][^\s"]*/giu

/**
 * `websearch_to_tsquery`'s groups of terms: an `or` between two terms
 * separates them, another is a word. A word of several words, `l'arbre`,
 * is a phrase.
 */
function parse(text: string): Term[][] {
	const groups: Term[][] = [[]]
	let minus = 0
	let operand = false
	for (const { 0: token, 1: quoted, index } of text.matchAll(tokens)) {
		if (token === '-') {
			minus += 1
			operand = false
			continue
		}
		const rest = text.slice(index + token.length)
		if (
			quoted === undefined &&
			token.toLowerCase() === 'or' &&
			operand &&
			/\S/u.test(rest)
		) {
			groups.push([])
			operand = false
			continue
		}
		const found = words(quoted ?? token)
		if (found.length > 0) groups.at(-1)?.push({ words: found, minus })
		minus = 0
		operand = true
	}
	return groups.filter((group) => group.length > 0)
}

/** The searched fields of `row`, in declaration order, as one document. */
function documentOf(
	fields: Fields,
	row: { readonly [field: string]: unknown },
): Document {
	const texts = searchedFields(fields?.values() ?? []).map((name) => row[name])
	const result = new Map<string, number[]>()
	const all = texts.filter((text) => typeof text === 'string').join(' ')
	for (const [at, word] of words(all).entries()) {
		result.set(word, [...(result.get(word) ?? []), at + 1])
	}
	return result
}

/** Whether the words of a phrase follow each other in `found`. */
function has(found: Document, [first = '', ...rest]: readonly string[]) {
	return (found.get(first) ?? []).some((at) =>
		rest.every((word, index) => found.get(word)?.includes(at + index + 1)),
	)
}

/** Whether `row` matches the search `text`; a text with no words matches none. */
export function searches(
	fields: Fields,
	row: { readonly [field: string]: unknown },
	text: string,
): boolean {
	const found = documentOf(fields, row)
	return parse(text).some((group) =>
		group.every((term) => has(found, term.words) === (term.minus % 2 === 0)),
	)
}

/** An unweighted word's weight in `ts_rank`. */
const weight = 0.1

/** `ts_rank`'s `calc_rank_or`: each word found, by its occurrences. */
function rankOr(found: Document, items: readonly string[]): number {
	let sum = 0
	for (const item of items) {
		const positions = found.get(item) ?? []
		if (positions.length === 0) continue
		let occurrences = 0
		for (const at of positions.keys()) occurrences += weight / (at + 1) ** 2
		// The sum of 1/i² tends to π²/6.
		sum += occurrences / 1.64493406685
	}
	return sum / items.length
}

/** How near two positions are in `calc_rank_and`. */
const nearness = (distance: number): number =>
	distance > 100 ? 1e-30 : 1 / (1.005 + 0.05 * Math.exp(distance / 1.5 - 2))

/** `ts_rank`'s `calc_rank_and`: each pair of words found, by their distance. */
function rankAnd(found: Document, items: readonly string[]): number {
	let rank = -1
	const lists = items.map((item) => found.get(item) ?? [])
	for (const [index, mine] of lists.entries()) {
		for (const theirs of lists.slice(0, index)) {
			for (const a of mine) {
				for (const b of theirs) {
					if (a === b) continue
					const near = Math.sqrt(weight * weight * nearness(Math.abs(a - b)))
					rank = rank < 0 ? near : 1 - (1 - rank) * (1 - near)
				}
			}
		}
	}
	return rank
}

/**
 * How well `row` matches `text`, as `ts_rank` computes it in a `real`: an
 * `and` of words or a phrase ranks their nearness, any other query its
 * words' occurrences.
 */
export function relevance(
	fields: Fields,
	row: { readonly [field: string]: unknown },
	text: string,
): number {
	const found = documentOf(fields, row)
	const groups = parse(text)
	const terms = groups.flat()
	if (found.size === 0 || terms.length === 0) return 0
	const items = [...new Set(terms.flatMap((term) => term.words))]
	const [only] = terms
	const and =
		groups.length === 1 &&
		(terms.length > 1 || (only?.minus === 0 && only.words.length > 1))
	const rank =
		and && items.length > 1 ? rankAnd(found, items) : rankOr(found, items)
	return Math.fround(rank < 0 ? 1e-20 : rank)
}
