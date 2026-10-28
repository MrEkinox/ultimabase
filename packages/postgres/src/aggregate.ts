// An aggregate as one statement (D-143): its values in a jsonb array, a sum
// and an average as float8, a date in UTC as a read returns it.
import type { QueryExecutorProvider } from 'kysely'
import { sql } from 'kysely'
import type { Aggregate, AggregateRead } from 'ultimabase'
import type { Sql } from './filter.ts'
import { Filters } from './filter.ts'
import type { Catalog, Table } from './names.ts'

function value(
	catalog: Catalog,
	filters: Filters,
	at: { readonly table: Table; readonly alias: string },
	{ operation, field }: Aggregate,
): Sql {
	if (field === undefined) return sql`count(*)`
	const column = filters.column(at.table, at.alias, field)
	if (operation === 'count') return sql`count(${column})`
	if (operation === 'sum' || operation === 'avg') {
		return sql`cast(${sql.raw(operation)}(${column}) as float8)`
	}
	const extreme = sql`${sql.raw(operation)}(${column})`
	return catalog.kind(at.table, field) === 'date'
		? sql`(${extreme} at time zone 'UTC')`
		: extreme
}

export function compileAggregate(catalog: Catalog, read: AggregateRead): Sql {
	const filters = new Filters(catalog)
	const alias = filters.alias()
	const table = catalog.table(read.model)
	const values = read.aggregates.map((each) =>
		value(catalog, filters, { table, alias }, each),
	)
	// PostgreSQL takes at most 100 arguments per call.
	const arrays: Sql[] = []
	for (let at = 0; at < values.length; at += 100) {
		arrays.push(sql`jsonb_build_array(${sql.join(values.slice(at, at + 100))})`)
	}
	const where = filters.where(read.model, alias, read.where)
	return sql`select ${sql.join(arrays, sql` || `)} as "values" from ${sql.id(table.name)} as ${sql.id(alias)} where ${where}`
}

/** The values of `read`'s aggregates, a date back as a `Date`. */
export async function aggregate(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: AggregateRead,
): Promise<unknown[]> {
	const { rows } = await compileAggregate(catalog, read).execute(db)
	const [row] = rows
	const values: unknown =
		typeof row === 'object' && row !== null
			? Reflect.get(row, 'values')
			: undefined
	if (!Array.isArray(values)) throw new Error('The aggregates are not a list.')
	const table = catalog.table(read.model)
	return read.aggregates.map(({ field }, index): unknown => {
		const item: unknown = values[index]
		return typeof item === 'string' &&
			field !== undefined &&
			catalog.kind(table, field) === 'date'
			? new Date(`${item}Z`)
			: item
	})
}
