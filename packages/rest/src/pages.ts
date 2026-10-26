// Pages (D-55, D-129): GraphQL's Relay arguments and `take`/`skip` as a
// kernel read, within the limits, and the rows read as a connection.
import type { Row } from 'ultimabase'
import type { Api, Args, Entry } from './entries.ts'
import { badInput } from './errors.ts'

/** Where an argument was written: `first`, or `include.posts.first`. */
export type At = (name: string) => string

export const encode = (id: string): string =>
	Buffer.from(id).toString('base64url')

function decode(cursor: string, arg: string): string {
	const id = Buffer.from(cursor, 'base64url').toString()
	if (id === '' || encode(id) !== cursor) {
		throw badInput(`${arg} is not a cursor this API returned.`)
	}
	return id
}

/** An `Int` argument; `null` is absent, as in GraphQL. */
function integer(args: Args, name: string, at: At): number | undefined {
	const value = args[name]
	if (value === undefined || value === null) return undefined
	if (typeof value === 'number' && Number.isSafeInteger(value)) return value
	throw badInput(`${at(name)} must be an integer.`)
}

/** A `String` argument; `null` is absent, as in GraphQL. */
function text(args: Args, name: string, at: At): string | undefined {
	const value = args[name]
	if (value === undefined || value === null) return undefined
	if (typeof value === 'string') return value
	throw badInput(`${at(name)} must be a string.`)
}

/** The rows asked for, within the model's limits unless Master asks. */
function size(
	asked: number | undefined,
	name: string,
	entry: Entry,
	master: boolean,
): number | undefined {
	if (asked !== undefined && asked < 0) {
		throw badInput(`${name} cannot be negative.`)
	}
	if (master) return asked
	if (asked !== undefined && asked > entry.maxTake) {
		throw badInput(
			`${name} is at most ${entry.maxTake} on ${entry.model.name}.`,
		)
	}
	return asked ?? entry.take
}

/** A Relay page: the rows asked for and its direction. */
export type Relay = {
	readonly size: number | undefined
	readonly backward: boolean
}

/** A list's kernel read, and its Relay page unless `pagination: 'list'`. */
export type Page = { readonly read: Args; readonly relay: Relay | undefined }

/**
 * One row more than asked tells whether another page follows. The cursor's
 * row is included by the kernel, so `skip: 1` starts after it.
 */
function relay(args: Args, entry: Entry, master: boolean, at: At): Page {
	const after = text(args, 'after', at)
	const before = text(args, 'before', at)
	const first = integer(args, 'first', at)
	const last = integer(args, 'last', at)
	const backward = last !== undefined || before !== undefined
	if (backward && (first !== undefined || after !== undefined)) {
		throw badInput(
			'Page forward with first and after, or backward with last and before, not both.',
		)
	}
	const rows = backward
		? size(last, at('last'), entry, master)
		: size(first, at('first'), entry, master)
	const cursor = backward ? before : after
	const read: { [key: string]: unknown } = {}
	if (rows !== undefined) read['take'] = backward ? -(rows + 1) : rows + 1
	// Master's whole list, read backward from a cursor.
	else if (backward) read['take'] = -Number.MAX_SAFE_INTEGER
	if (cursor !== undefined) {
		read['cursor'] = { id: decode(cursor, at(backward ? 'before' : 'after')) }
		read['skip'] = 1
	}
	return { read, relay: { size: rows, backward } }
}

/** `take` and `skip` for `pagination: 'list'`. */
function list(args: Args, entry: Entry, master: boolean, at: At): Page {
	const take = size(integer(args, 'take', at), at('take'), entry, master)
	const skip = integer(args, 'skip', at)
	const read = {
		...(take === undefined ? {} : { take }),
		...(skip === undefined ? {} : { skip }),
	}
	return { read, relay: undefined }
}

/** The page a list's arguments ask for. */
export const pageOf = (
	api: Api,
	entry: Entry,
	args: Args,
	master: boolean,
	at: At,
): Page =>
	api.pagination === 'list'
		? list(args, entry, master, at)
		: relay(args, entry, master, at)

/** The page arguments of each pagination. */
export const pageArgs = (api: Api): readonly string[] =>
	api.pagination === 'list'
		? ['take', 'skip']
		: ['first', 'after', 'last', 'before']

/** The rows of a Relay read, without the one read to look ahead. */
export function connection(
	rows: readonly Row[],
	page: Relay,
	node: (row: Row) => unknown,
): { readonly [key: string]: unknown } {
	const more = page.size !== undefined && rows.length > page.size
	const kept = more ? (page.backward ? rows.slice(1) : rows.slice(0, -1)) : rows
	const edges = kept.map((row) => ({ cursor: encode(row.id), node: node(row) }))
	return {
		edges,
		pageInfo: {
			hasNextPage: more && !page.backward,
			hasPreviousPage: more && page.backward,
			startCursor: edges[0]?.cursor ?? null,
			endCursor: edges.at(-1)?.cursor ?? null,
		},
	}
}

const isRow = (value: unknown): value is Row =>
	typeof value === 'object' &&
	value !== null &&
	'id' in value &&
	typeof value.id === 'string'

/** A row's relation as the kernel returned it. */
export function rowsOf(value: unknown): readonly Row[] {
	return Array.isArray(value) ? value.filter(isRow) : []
}

export const rowOf = (value: unknown): Row | undefined =>
	isRow(value) ? value : undefined
