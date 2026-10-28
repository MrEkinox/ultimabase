// The changes of a write as CTEs, and how they split into statements (D-99).
import { createQueryId, PostgresQueryCompiler, sql } from 'kysely'
import type { Row } from 'ultimabase'
import type { Sql } from './filter.ts'
import { value } from './filter.ts'
import type { Catalog, Kind } from './names.ts'

const compiler = new PostgresQueryCompiler()

/** How many parameters a piece of SQL binds. */
export function sizeOf(piece: Sql): number {
	return compiler.compileQuery(piece.toOperationNode(), createQueryId())
		.parameters.length
}

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
		build: (gate) =>
			gate === undefined
				? sql`insert into ${name} (${columns}) values ${tuples(false)} returning *`
				: sql`insert into ${name} (${columns}) select * from (values ${tuples(true)}) as "v" where ${gate} returning *`,
		inserts: true,
		removes: false,
		adds: true,
		reads: new Set(),
	}
}

/** What the current statement writes to a table. */
type Written = { readonly inserts: boolean; readonly pairs: Set<string> }

/** Whether `each` may join a statement that already wrote `prior`. */
function fits(prior: Written | undefined, each: Part): boolean {
	if (prior === undefined) return true
	// A join table's changes of distinct pairs never meet.
	if (each.pairs !== undefined) {
		return [...each.pairs].every((pair) => !prior.pairs.has(pair))
	}
	return prior.inserts && each.inserts
}

/**
 * The parts of one statement each: a part starts a new one when it writes a
 * table the statement writes (inserts, and a join table's distinct pairs,
 * aside) or reads one, since the parts of a statement see the database as it
 * was, or when its parameters would not fit in the `room` left.
 */
export function grouped(parts: readonly Part[], room: number): Part[][] {
	const groups: Part[][] = [[]]
	const written = new Map<string, Written>()
	let used = 0
	for (const each of parts) {
		const size = sizeOf(each.build(undefined))
		const clash =
			!fits(written.get(each.table), each) ||
			[...each.reads].some((table) => written.has(table)) ||
			(used > 0 && used + size > room)
		if (clash) {
			groups.push([])
			written.clear()
			used = 0
		}
		used += size
		groups.at(-1)?.push(each)
		const prior = written.get(each.table)
		written.set(each.table, {
			inserts: (prior?.inserts ?? true) && each.inserts,
			pairs: new Set([...(prior?.pairs ?? []), ...(each.pairs ?? [])]),
		})
	}
	return groups
}
