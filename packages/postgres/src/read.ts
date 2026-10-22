// A read as one statement (D-46): every list, the root's and each included
// `many`, is a jsonb array the database builds, so relations at any depth
// cost no extra round trip.
import { sql } from 'kysely'
import type { CountRead, Nested, Order, Read } from 'ultimabase'
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
	field: order.field,
	direction: order.direction === 'asc' ? 'desc' : 'asc',
})

class Compiler {
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
				({ field, direction }) =>
					sql`${this.filters.column(table, alias, field)} ${sql.raw(direction)}`,
			),
		)
		const conditions = [
			reach.on,
			this.filters.where(model, alias, nested.where),
		]
		let from = reach.from
		if (nested.cursor !== undefined) {
			const cursor = this.filters.alias()
			const found = this.filters.alias()
			const keys = order.map(
				({ field }, at) =>
					sql`${this.filters.column(table, found, field)} as ${sql.id(`k${at}`)}`,
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
		for (const [at, { field, direction }] of [
			...order.entries(),
		].toReversed()) {
			const a = this.filters.column(table, alias, field)
			const c = sql.id(cursor, `k${at}`)
			const after =
				direction === 'asc'
					? sql`(${a} > ${c} or (${a} is null and ${c} is not null))`
					: sql`(${a} < ${c} or (${a} is not null and ${c} is null))`
			result = sql`(${after} or (${a} is not distinct from ${c} and ${result}))`
		}
		return result
	}

	/** A row as jsonb: its fields, each `one` as `{ id }`, then its includes. */
	row(model: string, alias: string, nested: Nested): Sql {
		const table = this.catalog.table(model)
		const pairs = new Map<string, Sql>()
		for (const name of ['id', 'createdAt', 'updatedAt']) {
			pairs.set(name, this.filters.column(table, alias, name))
		}
		for (const field of table.model.fields) {
			if (field.kind === 'scalar') {
				pairs.set(field.name, this.filters.column(table, alias, field.name))
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
		return object([...pairs])
	}
}

/**
 * `read`'s rows as one jsonb array; a locked read locks the root rows its
 * `where` selects (D-99).
 */
export function compileRows(catalog: Catalog, read: Read): Sql {
	const compiler = new Compiler(catalog)
	const alias = compiler.filters.alias()
	const name = sql.id(catalog.table(read.model).name)
	const as = sql.id(alias)
	const from = read.lock
		? sql`(select * from ${name} as ${as} where ${compiler.filters.where(read.model, alias, read.where)} for update) as ${as}`
		: sql`${name} as ${as}`
	return compiler.list(read.model, read, { from, on: sql`true` }, alias)
}

/** The statement that returns `read`'s rows as one jsonb array, `rows`. */
export function compileFind(catalog: Catalog, read: Read): Sql {
	return sql`select ${compileRows(catalog, read)} as "rows"`
}

export function compileCount(catalog: Catalog, read: CountRead): Sql {
	const filters = new Filters(catalog)
	const alias = filters.alias()
	const table = catalog.table(read.model)
	const where = filters.where(read.model, alias, read.where)
	return sql`select cast(count(*) as integer) as "count" from ${sql.id(table.name)} as ${sql.id(alias)} where ${where}`
}
