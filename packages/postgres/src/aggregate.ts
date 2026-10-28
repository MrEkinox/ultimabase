// An aggregate as one statement (D-143), in groups (D-146): an inner select
// gives each row's keys and aggregated columns, the outer one groups, sorts
// and pages them. Each group's values are a jsonb array: a sum and an
// average as float8, a date in UTC as a read returns it, a decimal as text,
// exact (D-145).
import type { QueryExecutorProvider } from 'kysely'
import { sql } from 'kysely'
import type { Aggregate, AggregateRead, GroupKey } from 'ultimabase'
import type { Sql } from './filter.ts'
import type { Catalog, Kind, Table } from './names.ts'
import { Compiler, sorted } from './read.ts'

/** A value as jsonb keeps it: a decimal as text, a date in UTC. */
function shown(kind: Kind | undefined, item: Sql): Sql {
	if (kind === 'decimal') return sql`cast(${item} as text)`
	return kind === 'date' ? sql`(${item} at time zone 'UTC')` : item
}

/** The aggregate of `column`, as PostgreSQL computes it. */
function computed({ operation, field }: Aggregate, column: Sql): Sql {
	if (field === undefined) return sql`count(*)`
	return sql`${sql.raw(operation)}(${column})`
}

/** The aggregate as jsonb keeps it; a sum and an average as float8. */
function value(kind: Kind | undefined, asked: Aggregate, column: Sql): Sql {
	const result = computed(asked, column)
	const { operation, field } = asked
	if (field === undefined || operation === 'count') return result
	if (kind === 'decimal' && operation !== 'avg') return shown(kind, result)
	if (operation === 'sum' || operation === 'avg') {
		return sql`cast(${result} as float8)`
	}
	return shown(kind, result)
}

/** The kind of a key's value: its field's, on the model `through` reaches. */
function kindOf(catalog: Catalog, table: Table, key: GroupKey): Kind {
	let at = table
	for (const step of key.through ?? []) {
		const field = at.fields.get(step.relation)
		if (field === undefined || field.kind === 'scalar') {
			throw new Error(`${at.model.name}.${step.relation} is not a relation.`)
		}
		at = catalog.table(field.target)
	}
	return catalog.kind(at, key.field)
}

/** Each aggregate's kind, `undefined` for a count of rows. */
function kinds(
	catalog: Catalog,
	table: Table,
	read: AggregateRead,
): (Kind | undefined)[] {
	return read.aggregates.map(({ field }) =>
		field === undefined ? undefined : catalog.kind(table, field),
	)
}

export function compileAggregate(catalog: Catalog, read: AggregateRead): Sql {
	const compiler = new Compiler(catalog)
	const { filters } = compiler
	const alias = filters.alias()
	const grouped = filters.alias()
	const table = catalog.table(read.model)
	const by = read.by ?? []
	const inner = [
		...by.map(
			(key, at) =>
				sql`${compiler.key(table, alias, key)} as ${sql.id(`k${at}`)}`,
		),
		...read.aggregates.flatMap(({ field }, at) =>
			field === undefined
				? []
				: [sql`${filters.column(table, alias, field)} as ${sql.id(`c${at}`)}`],
		),
	]
	const keys = by.map((_, at) => sql.id(grouped, `k${at}`))
	const types = kinds(catalog, table, read)
	const aggregates = read.aggregates.map((each, at) => {
		const column = sql.id(grouped, `c${at}`)
		return { kind: types[at], each, column }
	})
	const values = [
		...by.map((key, at) =>
			shown(kindOf(catalog, table, key), sql.id(grouped, `k${at}`)),
		),
		...aggregates.map(({ kind, each, column }) => value(kind, each, column)),
	]
	// PostgreSQL takes at most 100 arguments per call.
	const arrays: Sql[] = []
	for (let at = 0; at < values.length; at += 100) {
		arrays.push(sql`jsonb_build_array(${sql.join(values.slice(at, at + 100))})`)
	}
	const where = filters.where(read.model, alias, read.where)
	const rows = sql`(select ${sql.join([sql`1`, ...inner])} from ${sql.id(table.name)} as ${sql.id(alias)} where ${where}) as ${sql.id(grouped)}`
	const group = by.length === 0 ? sql`` : sql` group by ${sql.join(keys)}`
	const sorts = (read.orderBy ?? []).map((each) => {
		const found = aggregates[each.at - by.length]
		const key =
			found === undefined
				? sql.id(grouped, `k${each.at}`)
				: computed(found.each, found.column)
		return sorted(key, each)
	})
	const order = sorts.length === 0 ? sql`` : sql` order by ${sql.join(sorts)}`
	const limit = read.take === undefined ? sql`` : sql` limit ${read.take}`
	const offset = read.skip === undefined ? sql`` : sql` offset ${read.skip}`
	return sql`select ${sql.join(arrays, sql` || `)} as "values" from ${rows}${group}${order}${limit}${offset}`
}

/** Each group's values, a date back as a `Date`. */
export async function aggregate(
	catalog: Catalog,
	db: QueryExecutorProvider,
	read: AggregateRead,
): Promise<unknown[][]> {
	const { rows } = await compileAggregate(catalog, read).execute(db)
	const table = catalog.table(read.model)
	const by = read.by ?? []
	const types = [
		...by.map((key) => kindOf(catalog, table, key)),
		...kinds(catalog, table, read),
	]
	return rows.map((row) => {
		const values: unknown =
			typeof row === 'object' && row !== null
				? Reflect.get(row, 'values')
				: undefined
		if (!Array.isArray(values)) throw new Error('The values are not a list.')
		return types.map((kind, index): unknown => {
			const item: unknown = values[index]
			return typeof item === 'string' && kind === 'date'
				? new Date(`${item}Z`)
				: item
		})
	})
}
