// The changes of a write as CTEs, and how they split into statements (D-99).
import type { Row } from 'ultimabase'
import type { Sql } from './filter.ts'
import { value } from './filter.ts'
import type { Catalog, Kind, Table } from './names.ts'
import type { Noted } from './notify.ts'
import { rows as noted } from './notify.ts'
import { sizeOf, sql } from './text.ts'

/** A change as a CTE, and what deciding where it runs needs of it. */
export type Part = {
	readonly build: (gate: Sql | undefined) => Sql
	readonly table: string
	/** The columns that identify a row: `id`, or a join table's two keys. */
	readonly key: readonly string[]
	readonly inserts: boolean
	readonly removes: boolean
	readonly adds: boolean
	readonly reads: ReadonlySet<string>
	/** A join table's change: the pairs it links or unlinks, `self:other`. */
	readonly pairs?: ReadonlySet<string>
	/** The one row it writes, by id, when its RETURNING holds only that row. */
	readonly row?: string
	/**
	 * The rows it writes, by id, when it writes no others and sets no key a
	 * row of its table could take in its stead: an insert's, or an update by
	 * id of no key column. Such parts of a table share a statement when their
	 * rows differ, as their order cannot change what they do.
	 */
	readonly rows?: ReadonlySet<string>
	/** What the feed says of its rows (D-154). */
	readonly noted: Noted
}

/** A column's type, which a row of VALUES under a SELECT does not infer. */
const types: { readonly [kind in Kind]: string } = {
	id: 'uuid',
	string: 'text',
	enum: 'text',
	number: 'double precision',
	decimal: 'numeric',
	integer: 'integer',
	boolean: 'boolean',
	dateTime: 'timestamptz',
	date: 'date',
	json: 'jsonb',
	'text[]': 'text[]',
	'double precision[]': 'double precision[]',
	'integer[]': 'integer[]',
}

export const fieldsOf = (row: {
	readonly [field: string]: unknown
}): string[] => Object.keys(row).filter((name) => row[name] !== undefined)

/** Rows inserted into a table, which all set the fields of the first. */
export function inserted(
	catalog: Catalog,
	model: string,
	rows: readonly Row[],
): Part {
	const table = catalog.table(model)
	const name = sql.id(table.name)
	const fields = fieldsOf(rows[0] ?? {})
	const columns = sql.join(
		fields.map((field) => sql.id(catalog.column(table, field))),
	)
	const tuples = (typed: boolean): Sql =>
		sql.join(
			rows.map((row, at) => {
				const values = fields.map((field) => {
					const kind = catalog.kind(table, field)
					const item = value(kind, row[field])
					// The first row's types are the other rows'.
					return typed && at === 0
						? sql`cast(${item} as ${sql.raw(types[kind])})`
						: item
				})
				return sql`(${sql.join(values)})`
			}),
		)
	const [only] = rows
	return {
		table: table.name,
		key: ['id'],
		...(rows.length === 1 && only !== undefined ? { row: only.id } : {}),
		rows: new Set(rows.map((row) => row.id)),
		build: (gate) =>
			gate === undefined
				? sql`insert into ${name} (${columns}) values ${tuples(false)} returning *`
				: sql`insert into ${name} (${columns}) select * from (values ${tuples(true)}) as "v" where ${gate} returning *`,
		inserts: true,
		removes: false,
		adds: true,
		reads: new Set(),
		noted: noted('insert', model),
	}
}

const keys = new WeakMap<Table, ReadonlySet<string>>()

/**
 * The fields of a table whose value one row could take in another's stead,
 * so that the order of two updates matters: those of a unique key or of a
 * partial key's predicate, and the relation keys.
 */
function keyed(table: Table): ReadonlySet<string> {
	const known = keys.get(table)
	if (known !== undefined) return known
	const made = new Set(table.uniques.flatMap(({ fields }) => fields))
	for (const { where } of table.model.indexes) {
		for (const field of Object.keys(where ?? {})) made.add(field)
	}
	for (const field of table.model.fields) {
		if (field.kind === 'one') made.add(field.name)
	}
	keys.set(table, made)
	return made
}

/** The row an update by `id` writes, unless it sets one of `fields`' keys. */
export function freeRow(
	table: Table,
	id: string | undefined,
	fields: readonly string[],
): ReadonlySet<string> | undefined {
	if (id === undefined) return undefined
	const taken = keyed(table)
	return fields.some((field) => taken.has(field)) ? undefined : new Set([id])
}

/** What the current statement writes to a table. */
type Written = {
	readonly inserts: boolean
	readonly pairs: Set<string>
	/** The rows its parts write, when each part knows them (`Part.rows`). */
	rows: Set<string> | undefined
}

/** Whether `each` may join a statement that already wrote `prior`. */
function fits(prior: Written | undefined, each: Part): boolean {
	if (prior === undefined) return true
	// A join table's changes of distinct pairs never meet.
	if (each.pairs !== undefined) {
		return [...each.pairs].every((pair) => !prior.pairs.has(pair))
	}
	if (prior.inserts && each.inserts) return true
	const { rows } = prior
	return (
		rows !== undefined &&
		each.rows !== undefined &&
		[...each.rows].every((id) => !rows.has(id))
	)
}

/**
 * The parts of one statement each: a part starts a new one when it writes a
 * table the statement writes (inserts, and a join table's distinct pairs,
 * aside) or reads one, since the parts of a statement see the database as it
 * was, or when its parameters would not fit in the `room` left.
 */
export function grouped(parts: readonly Part[], room: () => number): Part[][] {
	// A part alone has nothing to go apart from.
	if (parts.length < 2) return [[...parts]]
	const groups: Part[][] = [[]]
	const written = new Map<string, Written>()
	let used = 0
	for (const each of parts) {
		const size = sizeOf(each.build(undefined))
		const prior = written.get(each.table)
		// A part that knows its rows reads its table only there.
		const own = each.rows === undefined ? undefined : each.table
		const clash =
			!fits(prior, each) ||
			[...each.reads].some((table) => table !== own && written.has(table)) ||
			(used > 0 && used + size > room())
		if (clash) {
			groups.push([])
			written.clear()
			used = 0
		}
		used += size
		groups.at(-1)?.push(each)
		const kept = clash ? undefined : prior
		let rows: Set<string> | undefined
		if (each.rows !== undefined) {
			rows = kept === undefined ? new Set() : kept.rows
			for (const id of each.rows) rows?.add(id)
		}
		written.set(each.table, {
			inserts: (kept?.inserts ?? true) && each.inserts,
			pairs: new Set([...(kept?.pairs ?? []), ...(each.pairs ?? [])]),
			rows,
		})
	}
	return groups
}
