// A write as the fewest statements (D-99): its checks, then each change as a
// data-modifying CTE that runs only when they pass, then the read, which sees
// the changes through CTEs named as the written tables, or, with `before`,
// runs in the first statement and sees none (D-102). A read of the one row a
// change writes takes it from that change's RETURNING (D-103). The unique
// constraint a refused change names is the kernel's `UniqueViolation` (D-98).
import type { RawBuilder } from 'kysely'
import { sql } from 'kysely'
import type { Change, Check, Filter, Read, Write } from 'ultimabase'
import { UniqueViolation } from 'ultimabase'
import type { Sql } from './filter.ts'
import { Filters, uuid, value } from './filter.ts'
import type { Catalog, Table } from './names.ts'
import { compileRows } from './read.ts'

/** A statement of a write: how many checks its result carries, `c0`… */
export type Statement = {
	readonly sql: RawBuilder<{ readonly [column: string]: unknown }>
	readonly checks: number
}

/** A change as a CTE, and what deciding where it runs needs of it. */
type Part = {
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

function assignments(
	catalog: Catalog,
	table: Table,
	values: { readonly [field: string]: unknown },
): (readonly [string, Sql])[] {
	return Object.entries(values)
		.filter(([, item]) => item !== undefined)
		.map(([name, item]) => [
			catalog.column(table, name),
			value(catalog.kind(table, name), item),
		])
}

const and = (gate: Sql | undefined): Sql =>
	gate === undefined ? sql`` : sql` and ${gate}`

/** The id a filter selects by `{ id: { equals } }` alone, if any. */
function idOf(where: Filter | undefined): string | undefined {
	if (where === undefined || Object.keys(where).length !== 1) return undefined
	const id = where['id']
	if (typeof id !== 'object' || id === null || Object.keys(id).length !== 1) {
		return undefined
	}
	return 'equals' in id && typeof id.equals === 'string' ? id.equals : undefined
}

/** The CTE of a change, `undefined` when it changes nothing. */
function part(catalog: Catalog, change: Change): Part | undefined {
	if (change.kind === 'insert') {
		const table = catalog.table(change.model)
		const name = sql.id(table.name)
		const pairs = assignments(catalog, table, change.row)
		const columns = sql.join(pairs.map(([column]) => sql.id(column)))
		const values = sql.join(pairs.map(([, item]) => item))
		return {
			table: table.name,
			key: ['id'],
			row: change.row.id,
			build: (gate) =>
				gate === undefined
					? sql`insert into ${name} (${columns}) values (${values}) returning *`
					: sql`insert into ${name} (${columns}) select ${values} where ${gate} returning *`,
			inserts: true,
			removes: false,
			adds: true,
			reads: new Set(),
		}
	}
	if (change.kind !== 'update' && change.kind !== 'delete') {
		return links(catalog, change)
	}
	const table = catalog.table(change.model)
	const name = sql.id(table.name)
	const base = { table: table.name, key: ['id'] }
	const filters = new Filters(catalog)
	const named = filters.alias()
	const alias = sql.id(named)
	const where = filters.where(change.model, named, change.where)
	const reads = new Set([table.name, ...filters.tables])
	if (change.kind === 'update') {
		const set = sql.join(
			assignments(catalog, table, change.set).map(
				([column, item]) => sql`${sql.id(column)} = ${item}`,
			),
		)
		const row = idOf(change.where)
		return {
			...base,
			...(row === undefined ? {} : { row }),
			build: (gate) =>
				sql`update ${name} as ${alias} set ${set} where ${where}${and(gate)} returning ${alias}.*`,
			inserts: false,
			removes: true,
			adds: true,
			reads,
		}
	}
	return {
		...base,
		build: (gate) =>
			sql`delete from ${name} as ${alias} where ${where}${and(gate)} returning ${alias}.*`,
		inserts: false,
		removes: true,
		adds: false,
		reads,
	}
}

/** A link or unlink of nothing, or of ids no row has, changes nothing. */
function links(
	catalog: Catalog,
	change: Extract<Change, { readonly kind: 'link' | 'unlink' }>,
): Part | undefined {
	const join = catalog.join(change.model, change.field)
	const name = sql.id(join.table)
	const self = sql.id(join.self)
	const other = sql.id(join.other)
	const key = [join.self, join.other].toSorted()
	const id = sql`cast(${change.id} as uuid)`
	// The same pair, whichever side names it.
	const pairOf = (target: string): string =>
		key[0] === join.self ? `${change.id}:${target}` : `${target}:${change.id}`
	const pairs = (targets: readonly string[]) => ({
		table: join.table,
		key,
		reads: new Set<string>(),
		pairs: new Set(targets.map(pairOf)),
	})
	if (change.kind === 'unlink') {
		const targets = change.targets.filter((target) => uuid.test(target))
		if (targets.length === 0) return undefined
		const list = sql.join(targets.map((target) => sql`cast(${target} as uuid)`))
		return {
			...pairs(targets),
			build: (gate) =>
				sql`delete from ${name} where ${self} = ${id} and ${other} in (${list})${and(gate)} returning *`,
			inserts: false,
			removes: true,
			adds: false,
		}
	}
	if (change.targets.length === 0) return undefined
	const rows = sql.join(
		change.targets.map((target) => sql`(${id}, cast(${target} as uuid))`),
	)
	return {
		...pairs(change.targets),
		build: (gate) => {
			const source =
				gate === undefined
					? sql`values ${rows}`
					: sql`select * from (values ${rows}) as "v" where ${gate}`
			return sql`insert into ${name} (${self}, ${other}) ${source} on conflict do nothing returning *`
		},
		inserts: true,
		removes: false,
		adds: true,
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
 * was.
 */
function grouped(parts: readonly Part[]): Part[][] {
	const groups: Part[][] = [[]]
	const written = new Map<string, Written>()
	for (const each of parts) {
		const clash =
			!fits(written.get(each.table), each) ||
			[...each.reads].some((table) => written.has(table))
		if (clash) {
			groups.push([])
			written.clear()
		}
		groups.at(-1)?.push(each)
		const prior = written.get(each.table)
		written.set(each.table, {
			inserts: (prior?.inserts ?? true) && each.inserts,
			pairs: new Set([...(prior?.pairs ?? []), ...(each.pairs ?? [])]),
		})
	}
	return groups
}

function checking(catalog: Catalog, checks: readonly Check[]): Sql {
	const filters = new Filters(catalog)
	const columns = checks.map((check, at) => {
		const table = sql.id(catalog.table(check.model).name)
		const alias = filters.alias()
		const where = filters.where(check.model, alias, check.where)
		return sql`(select count(*) from ${table} as ${sql.id(alias)} where ${where}) = ${check.count} as ${sql.id(`c${at}`)}`
	})
	return sql`select ${sql.join(columns)}`
}

const cte = (at: number): Sql => sql.id(`#w${at}`)

/** Each written table as the read sees it: the changed rows in place. */
function views(parts: ReadonlyMap<number, Part>): Sql[] {
	const tables = new Map<string, [number, Part][]>()
	for (const [at, each] of parts) {
		tables.set(each.table, [...(tables.get(each.table) ?? []), [at, each]])
	}
	return [...tables].map(([table, written]) => {
		const name = sql.id(table)
		const key = written[0]?.[1].key ?? []
		const keys = sql.join(key.map((column) => sql.id(column)))
		const removed = written
			.filter(([, each]) => each.removes)
			.map(([at]) => sql`select ${keys} from ${cte(at)}`)
		const kept =
			removed.length === 0
				? sql`select * from ${name}`
				: sql`select * from ${name} where (${keys}) not in (${sql.join(removed, sql` union all `)})`
		const added = written
			.filter(([, each]) => each.adds)
			.map(([at]) => sql`select * from ${cte(at)}`)
		const body = sql.join([kept, ...added], sql` union all `)
		return sql`${name} as not materialized (${body})`
	})
}

/**
 * The change of a statement that writes the one row `read` selects, when no
 * other change of it writes that table: the read takes the row from its
 * RETURNING rather than from the table's view (D-103).
 */
function sourceOf(
	catalog: Catalog,
	read: Read,
	parts: ReadonlyMap<number, Part>,
): number | undefined {
	const id = idOf(read.where)
	const table = catalog.table(read.model).name
	const written = [...parts].filter(([, each]) => each.table === table)
	const [only] = written
	return id !== undefined && written.length === 1 && only?.[1].row === id
		? only[0]
		: undefined
}

/** The statements of a write, in the order they run. */
export function compileWrite(catalog: Catalog, write: Write): Statement[] {
	const checks = write.checks ?? []
	const parts = write.changes
		.map((change) => part(catalog, change))
		.filter((each) => each !== undefined)
	if (parts.length === 0 && checks.length === 0 && write.read === undefined) {
		return []
	}
	const columns = checks.map((_, at) => sql.id(`c${at}`))
	const gate =
		checks.length === 0
			? undefined
			: sql`(select ${sql.join(columns, sql` and `)} from "#checks")`
	const groups = grouped(parts)
	let next = 0
	return groups.map((group, index): Statement => {
		const first = index === 0 && checks.length > 0
		const numbered = new Map(group.map((each) => [next++, each]))
		const ctes = [...numbered].map(
			([at, each]) =>
				sql`${cte(at)} as (${each.build(first ? gate : undefined)})`,
		)
		const at = write.before === true ? 0 : groups.length - 1
		const read = index === at ? write.read : undefined
		const seen = read !== undefined && write.before !== true
		const source = seen ? sourceOf(catalog, read, numbered) : undefined
		const compiled =
			read === undefined
				? undefined
				: compileRows(
						catalog,
						read,
						source === undefined ? undefined : cte(source),
					)
		const selected = [
			...(first ? columns : []),
			...(compiled === undefined ? [] : [sql`${compiled.rows} as "rows"`]),
		]
		// The root's table needs no view when only its RETURNING is read.
		const root = read === undefined ? '' : catalog.table(read.model).name
		const viewed = [...numbered].filter(
			([, each]) =>
				source === undefined ||
				each.table !== root ||
				compiled?.tables.has(root) === true,
		)
		const all = [
			...(first ? [sql`"#checks" as (${checking(catalog, checks)})`] : []),
			...ctes,
			...(seen ? views(new Map(viewed)) : []),
		]
		const list = selected.length === 0 ? sql`1 as "one"` : sql.join(selected)
		const body = sql`select ${list}${first ? sql` from "#checks"` : sql``}`
		return {
			sql: all.length === 0 ? sql`${body}` : sql`with ${sql.join(all)} ${body}`,
			checks: first ? checks.length : 0,
		}
	})
}

function isUniqueError(
	error: unknown,
): error is { readonly code: string; readonly constraint: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === '23505' &&
		'constraint' in error &&
		typeof error.constraint === 'string'
	)
}

/** A unique constraint's refusal as the kernel's error; any other as is. */
export function translate(catalog: Catalog, error: unknown): unknown {
	if (!isUniqueError(error)) return error
	const unique = catalog.uniques.get(error.constraint)
	return unique === undefined
		? error
		: new UniqueViolation(unique.model, unique.fields)
}
