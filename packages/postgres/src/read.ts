// A read as one statement (D-46): every list, the root's and each included
// `many`, is a jsonb array the database builds, so relations at any depth
// cost no extra round trip.
import { sql } from 'kysely'
import type {
	CountRead,
	Filter,
	GroupKey,
	Nested,
	Order,
	Read,
} from 'ultimabase'
import type { Reach, Sql } from './filter.ts'
import { all, Filters } from './filter.ts'
import type { Catalog, Table } from './names.ts'

const empty = sql`cast('[]' as jsonb)`

/** PostgreSQL takes at most 100 arguments: 50 pairs per `jsonb_build_object`. */
function object(pairs: readonly (readonly [string, Sql])[]): Sql {
	const chunks: Sql[] = []
	for (let at = 0; at < pairs.length; at += 50) {
		const items = pairs
			.slice(at, at + 50)
			.flatMap(([key, item]) => [sql.lit(key), item])
		chunks.push(sql`jsonb_build_object(${sql.join(items)})`)
	}
	return sql.join(chunks, sql` || `)
}

const flip = (order: Order): Order => ({
	...order,
	direction: order.direction === 'asc' ? 'desc' : 'asc',
})

export class Compiler {
	readonly filters: Filters
	readonly catalog: Catalog

	constructor(catalog: Catalog) {
		this.catalog = catalog
		this.filters = new Filters(catalog)
	}

	/** The rows `nested` selects among those `reach` gives, as a jsonb array. */
	list(model: string, nested: Nested, reach: Reach, alias: string): Sql {
		const take = nested.take
		if (take === 0) return empty
		const table = this.catalog.table(model)
		const backward = take !== undefined && take < 0
		const given = nested.orderBy ?? [{ field: 'id', direction: 'asc' }]
		const order = backward ? given.map(flip) : given
		const by = sql.join(
			order.map(
				(each) =>
					sql`${this.key(table, alias, each)} ${sql.raw(each.direction)}`,
			),
		)
		const conditions = [
			reach.on,
			this.filters.where(model, alias, nested.where),
		]
		let from = reach.from
		if (nested.cursor !== undefined) {
			this.filters.tables.add(table.name)
			const cursor = this.filters.alias()
			const found = this.filters.alias()
			const keys = order.map(
				(each, at) =>
					sql`${this.key(table, found, each)} as ${sql.id(`k${at}`)}`,
			)
			const where = this.filters.where(model, found, nested.cursor)
			from = sql`${from} cross join (select ${sql.join(keys)} from ${sql.id(table.name)} as ${sql.id(found)} where ${where} limit 1) as ${sql.id(cursor)}`
			conditions.push(this.keyset(table, alias, cursor, order))
		}
		const limit = take === undefined ? sql`` : sql` limit ${Math.abs(take)}`
		const skip = nested.skip ?? 0
		const offset = skip === 0 ? sql`` : sql` offset ${skip}`
		const row = this.row(model, alias, nested)
		const rows = sql`select ${row} as "r", row_number() over (order by ${by}) as "n" from ${from} where ${all(conditions)} order by ${by}${limit}${offset}`
		const sequence = backward ? sql`"n" desc` : sql`"n"`
		return sql`(select coalesce(jsonb_agg("q"."r" order by ${sequence}), ${empty}) from (${rows}) as "q")`
	}

	/**
	 * The rows at or after the cursor in `order`, which `memory()` compares
	 * with `null` last ascending: `a ≥ c` is `a > c`, or `a = c` and the next
	 * key decides.
	 */
	private keyset(
		table: Table,
		alias: string,
		cursor: string,
		order: readonly Order[],
	): Sql {
		let result: Sql = sql`true`
		for (const [at, each] of [...order.entries()].toReversed()) {
			const { direction } = each
			const a = this.key(table, alias, each)
			const c = sql.id(cursor, `k${at}`)
			const after =
				direction === 'asc'
					? sql`(${a} > ${c} or (${a} is null and ${c} is not null))`
					: sql`(${a} < ${c} or (${a} is not null and ${c} is null))`
			result = sql`(${after} or (${a} is not distinct from ${c} and ${result}))`
		}
		return result
	}

	/**
	 * A sort key: a column, through `one` relations, or a count; a row the
	 * relations do not reach gives `null` (D-134). A relevance is `ts_rank`'s
	 * (D-148).
	 */
	key(
		table: Table,
		alias: string,
		order: Pick<Order, 'field' | 'through' | 'count' | 'relevance'>,
		steps: NonNullable<Order['through']> = order.through ?? [],
	): Sql {
		const [step, ...rest] = steps
		if (order.relevance !== undefined) {
			return sql`ts_rank(${sql.id(alias, '_search')}, ${this.filters.query(order.relevance)})`
		}
		if (step === undefined) {
			if (order.count === undefined) {
				return this.filters.column(table, alias, order.field)
			}
			return this.count(table, alias, order.field, order.count)
		}
		const field = table.fields.get(step.relation)
		if (field === undefined || field.kind === 'scalar') {
			throw new Error(`${table.model.name}.${step.relation} is not a relation.`)
		}
		const to = this.filters.alias()
		const reach = this.filters.reach(table, alias, field, to)
		const where = this.filters.where(field.target, to, step.where)
		const key = this.key(this.catalog.table(field.target), to, order, rest)
		return sql`(select ${key} from ${reach.from} where ${reach.on} and ${where} limit 1)`
	}

	/** The rows of a `many` relation of the row that `where` selects. */
	private count(table: Table, alias: string, name: string, where: Filter): Sql {
		const field = table.fields.get(name)
		if (field === undefined || field.kind === 'scalar') {
			throw new Error(`${table.model.name}.${name} is not a relation.`)
		}
		const to = this.filters.alias()
		const reach = this.filters.reach(table, alias, field, to)
		const rows = this.filters.where(field.target, to, where)
		return sql`(select cast(count(*) as integer) from ${reach.from} where ${reach.on} and ${rows})`
	}

	/**
	 * A scalar column, a date in UTC whatever the session's time zone, a
	 * decimal as text, which jsonb would make a number (D-145).
	 */
	private scalar(table: Table, alias: string, name: string): Sql {
		const column = this.filters.column(table, alias, name)
		const kind = this.catalog.kind(table, name)
		if (kind === 'decimal') return sql`cast(${column} as text)`
		return kind === 'date' ? sql`(${column} at time zone 'UTC')` : column
	}

	/** A row as jsonb: its fields, each `one` as `{ id }`, then its includes. */
	row(model: string, alias: string, nested: Nested): Sql {
		const table = this.catalog.table(model)
		const pairs = new Map<string, Sql>()
		const fields = nested.fields && new Set(['id', ...nested.fields])
		const reads = (name: string) => fields?.has(name) ?? true
		for (const name of ['id', 'createdAt', 'updatedAt'].filter(reads)) {
			pairs.set(name, this.scalar(table, alias, name))
		}
		for (const field of table.model.fields) {
			if (!reads(field.name)) continue
			if (field.kind === 'scalar') {
				pairs.set(field.name, this.scalar(table, alias, field.name))
			} else if (field.kind === 'one' && field.stored) {
				const key = this.filters.column(table, alias, field.name)
				pairs.set(
					field.name,
					sql`case when ${key} is null then null else jsonb_build_object('id', ${key}) end`,
				)
			} else if (field.kind === 'one') {
				const to = this.filters.alias()
				const reach = this.filters.reach(table, alias, field, to)
				pairs.set(
					field.name,
					sql`(select jsonb_build_object('id', ${sql.id(to, 'id')}) from ${reach.from} where ${reach.on} limit 1)`,
				)
			}
		}
		for (const [name, inner] of Object.entries(nested.include ?? {})) {
			const field = table.fields.get(name)
			if (field === undefined || field.kind === 'scalar') continue
			const to = this.filters.alias()
			const reach = this.filters.reach(table, alias, field, to)
			if (field.kind === 'many') {
				pairs.set(name, this.list(field.target, inner, reach, to))
				continue
			}
			const where = this.filters.where(field.target, to, inner.where)
			const row = this.row(field.target, to, inner)
			pairs.set(
				name,
				sql`(select ${row} from ${reach.from} where ${reach.on} and ${where} limit 1)`,
			)
		}
		const counts = Object.entries(nested.count ?? {}).map(
			([name, where]) => [name, this.count(table, alias, name, where)] as const,
		)
		if (counts.length > 0) pairs.set('_count', object(counts))
		return object([...pairs])
	}
}

/**
 * The `id` of the first row of each `distinct` key in `read`'s order
 * (D-147), which the read then sorts and pages.
 */
function kept(
	compiler: Compiler,
	read: Read,
	distinct: readonly GroupKey[],
): Sql {
	const { filters } = compiler
	const table = compiler.catalog.table(read.model)
	const alias = filters.alias()
	const numbered = filters.alias()
	filters.tables.add(table.name)
	const keys = distinct.map((key) => compiler.key(table, alias, key))
	const order = (read.orderBy ?? [{ field: 'id', direction: 'asc' }]).map(
		(each) =>
			sql`${compiler.key(table, alias, each)} ${sql.raw(each.direction)}`,
	)
	const where = filters.where(read.model, alias, read.where)
	const id = filters.column(table, alias, 'id')
	const rows = sql`select row_number() over (partition by ${sql.join(keys)} order by ${sql.join(order)}) as "n", ${id} as "i" from ${sql.id(table.name)} as ${sql.id(alias)} where ${where}`
	return sql`select ${sql.id(numbered, 'i')} from (${rows}) as ${sql.id(numbered)} where ${sql.id(numbered, 'n')} = 1`
}

/**
 * `read`'s rows as one jsonb array, its root rows taken from `source`, by
 * default its table, and the tables it reaches besides; a locked read locks
 * the root rows its `where` selects, in `id` order (D-99, D-133).
 */
export function compileRows(
	catalog: Catalog,
	read: Read,
	source?: Sql,
): { readonly rows: Sql; readonly tables: ReadonlySet<string> } {
	const compiler = new Compiler(catalog)
	const alias = compiler.filters.alias()
	const name = source ?? sql.id(catalog.table(read.model).name)
	const as = sql.id(alias)
	const table = catalog.table(read.model)
	const id = compiler.filters.column(table, alias, 'id')
	// In `id` order, so two reads of the same rows wait instead of deadlocking (D-133).
	let from = read.lock
		? sql`(select * from ${name} as ${as} where ${compiler.filters.where(read.model, alias, read.where)} order by ${id} for update) as ${as}`
		: sql`${name} as ${as}`
	if (read.distinct !== undefined) {
		from = sql`(select * from ${name} as ${as} where ${id} in (${kept(compiler, read, read.distinct)})) as ${as}`
	}
	const rows = compiler.list(read.model, read, { from, on: sql`true` }, alias)
	return { rows, tables: compiler.filters.tables }
}

/** The statement that returns `read`'s rows as one jsonb array, `rows`. */
export function compileFind(catalog: Catalog, read: Read): Sql {
	return sql`select ${compileRows(catalog, read).rows} as "rows"`
}

export function compileCount(catalog: Catalog, read: CountRead): Sql {
	const filters = new Filters(catalog)
	const alias = filters.alias()
	const table = catalog.table(read.model)
	const where = filters.where(read.model, alias, read.where)
	return sql`select cast(count(*) as integer) as "count" from ${sql.id(table.name)} as ${sql.id(alias)} where ${where}`
}
