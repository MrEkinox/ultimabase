// Pages (D-55, D-129): Relay arguments and `take`/`skip` as a kernel read,
// within the limits, and the rows read as a connection.
import type { Row } from 'ultimabase'
import { isRow } from 'ultimabase/internal'
import { badInput } from './transport.ts'

/** A list's arguments, as the client wrote them. */
export type Args = { readonly [key: string]: unknown }

/** Where an argument was written: `first`, or `include.posts.first`. */
export type At = (name: string) => string

/** A transport's `pagination` setting (D-55). */
export type Pagination = 'connection' | 'list'

/** A model's limits: the rows a list returns by default, and at most. */
export type Limits = {
	readonly take: number
	readonly maxTake: number
	readonly model: { readonly name: string }
}

const encode = (id: string): string => Buffer.from(id).toString('base64url')

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
	limits: Limits,
	master: boolean,
): number | undefined {
	if (asked !== undefined && asked < 0) {
		throw badInput(`${name} cannot be negative.`)
	}
	if (master) return asked
	if (asked !== undefined && asked > limits.maxTake) {
		throw badInput(
			`${name} is at most ${limits.maxTake} on ${limits.model.name}.`,
		)
	}
	return asked ?? limits.take
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
function relay(args: Args, limits: Limits, master: boolean, at: At): Page {
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
		? size(last, at('last'), limits, master)
		: size(first, at('first'), limits, master)
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
function list(args: Args, limits: Limits, master: boolean, at: At): Page {
	const take = size(integer(args, 'take', at), at('take'), limits, master)
	const skip = integer(args, 'skip', at)
	const read = {
		...(take === undefined ? {} : { take }),
		...(skip === undefined ? {} : { skip }),
	}
	return { read, relay: undefined }
}

/** The page a list's arguments ask for. */
export const pageOf = (
	pagination: Pagination,
	limits: Limits,
	args: Args,
	master: boolean,
	at: At = (name) => name,
): Page =>
	pagination === 'list'
		? list(args, limits, master, at)
		: relay(args, limits, master, at)

/** The page arguments of each pagination. */
export const pageArgs = (pagination: Pagination): readonly string[] =>
	pagination === 'list'
		? ['take', 'skip']
		: ['first', 'after', 'last', 'before']

export type Connection<N> = {
	readonly edges: readonly { readonly cursor: string; readonly node: N }[]
	readonly pageInfo: {
		readonly hasNextPage: boolean
		readonly hasPreviousPage: boolean
		readonly startCursor: string | null
		readonly endCursor: string | null
	}
}

/** The rows of a Relay read, without the one read to look ahead. */
export function connection<N>(
	rows: readonly Row[],
	page: Relay,
	node: (row: Row) => N,
): Connection<N> {
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

/** A row's relation as the kernel returned it. */
export function rowsOf(value: unknown): readonly Row[] {
	return Array.isArray(value) ? value.filter(isRow) : []
}

export const rowOf = (value: unknown): Row | undefined =>
	isRow(value) ? value : undefined

/** A live read's change (D-154): a row that left, or one placed after another. */
export type Change<R> =
	| { readonly remove: string }
	| { readonly upsert: R; readonly after: string | null }

/** `window` once a live read's `changes` are applied, in their order. */
export function applied<T extends { readonly id: string }, R>(
	window: readonly T[],
	changes: readonly Change<R>[],
	kept: (upsert: R) => T,
): T[] {
	let rows = [...window]
	for (const change of changes) {
		if ('remove' in change) {
			rows = rows.filter(({ id }) => id !== change.remove)
			continue
		}
		const row = kept(change.upsert)
		rows = rows.filter(({ id }) => id !== row.id)
		const at =
			change.after === null
				? 0
				: rows.findIndex(({ id }) => id === change.after) + 1
		rows.splice(at, 0, row)
	}
	return rows
}
