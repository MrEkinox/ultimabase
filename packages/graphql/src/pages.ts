// Pages (D-55, D-107): Relay arguments and `take`/`skip` as a kernel read,
// within the limits, and the rows read as a connection.
import type { Row } from 'ultimabase'
import { badInput } from './errors.ts'
import { plainWhere } from './json-fields.ts'
import type { Args, Entry, Registry } from './registry.ts'

export const encode = (id: string): string =>
	Buffer.from(id).toString('base64url')

function decode(cursor: string, arg: string): string {
	const id = Buffer.from(cursor, 'base64url').toString()
	if (id === '' || encode(id) !== cursor) {
		throw badInput(`${arg} is not a cursor this API returned.`)
	}
	return id
}

const number = (args: Args, name: string): number | undefined => {
	const value = args[name]
	return typeof value === 'number' ? value : undefined
}
const text = (args: Args, name: string): string | undefined => {
	const value = args[name]
	return typeof value === 'string' ? value : undefined
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

/** A Relay page: its kernel read, the rows asked for and its direction. */
export type Relay = {
	readonly read: Args
	readonly size: number | undefined
	readonly backward: boolean
}

/**
 * One row more than asked tells whether another page follows. The cursor's
 * row is included by the kernel, so `skip: 1` starts after it.
 */
export function relay(args: Args, entry: Entry, master: boolean): Relay {
	const after = text(args, 'after')
	const before = text(args, 'before')
	const last = number(args, 'last')
	const backward = last !== undefined || before !== undefined
	if (
		backward &&
		(number(args, 'first') !== undefined || after !== undefined)
	) {
		throw badInput(
			'Page forward with first and after, or backward with last and before, not both.',
		)
	}
	const rows = backward
		? size(last, 'last', entry, master)
		: size(number(args, 'first'), 'first', entry, master)
	const cursor = backward ? before : after
	const read: { [key: string]: unknown } = {}
	if (rows !== undefined) read['take'] = backward ? -(rows + 1) : rows + 1
	// Master's whole list, read backward from a cursor.
	else if (backward) read['take'] = -Number.MAX_SAFE_INTEGER
	if (cursor !== undefined) {
		read['cursor'] = { id: decode(cursor, backward ? 'before' : 'after') }
		read['skip'] = 1
	}
	return { read, size: rows, backward }
}

/** `take` and `skip` for `pagination: 'list'`. */
export function list(args: Args, entry: Entry, master: boolean): Args {
	const take = size(number(args, 'take'), 'take', entry, master)
	const skip = number(args, 'skip')
	return {
		...(take === undefined ? {} : { take }),
		...(skip === undefined ? {} : { skip }),
	}
}

export type Connection = {
	readonly edges: readonly { readonly cursor: string; readonly node: Row }[]
	readonly pageInfo: {
		readonly hasNextPage: boolean
		readonly hasPreviousPage: boolean
		readonly startCursor: string | null
		readonly endCursor: string | null
	}
}

/** The rows of a Relay read, without the one read to look ahead. */
export function connection(rows: readonly Row[], page: Relay): Connection {
	const more = page.size !== undefined && rows.length > page.size
	const kept = more ? (page.backward ? rows.slice(1) : rows.slice(0, -1)) : rows
	const edges = kept.map((node) => ({ cursor: encode(node.id), node }))
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

/** The kernel's `where` of a list or count's arguments. */
export function whereOf(registry: Registry, model: string, args: Args): Args {
	const { where } = args
	return typeof where === 'object' && where !== null
		? { where: plainWhere(registry, model, { ...where }) }
		: {}
}

/** A list's kernel read, and its Relay page unless `pagination: 'list'`. */
export function listRead(
	registry: Registry,
	entry: Entry,
	args: Args,
	master: boolean,
): { readonly read: Args; readonly page: Relay | undefined } {
	const { pagination } = registry.settings
	const { orderBy } = args
	const shared = {
		...whereOf(registry, entry.model.name, args),
		...(orderBy === undefined || orderBy === null ? {} : { orderBy }),
	}
	if (pagination === 'list') {
		return {
			read: { ...shared, ...list(args, entry, master) },
			page: undefined,
		}
	}
	const page = relay(args, entry, master)
	return { read: { ...shared, ...page.read }, page }
}
