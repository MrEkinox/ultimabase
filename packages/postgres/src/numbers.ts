// Number and list updates (D-132, D-149): computed by the UPDATE on the row
// as it finds it, and a number outside its column's type refused as the
// kernel's error.
import type { Arithmetic, ListUpdate, Write } from 'ultimabase'
import { OutOfRange } from 'ultimabase'
import type { Sql } from './filter.ts'
import { value } from './filter.ts'
import type { Catalog, Kind, Table } from './names.ts'
import { sql } from 'kysely'

// An integer divided by an integer truncates toward zero, as D-132 says.
const operators = { increment: '+', decrement: '-', multiply: '*', divide: '/' }

/**
 * A list update on `column`: `pushUnique` appends each element the list
 * lacks once, in its first position's order; `remove` keeps the others in
 * theirs.
 */
function listed(
	column: Sql,
	{ operation, elements }: ListUpdate,
	kind: Kind,
): Sql {
	const given = value(kind, elements)
	if (operation === 'push') return sql`${column} || ${given}`
	if (operation === 'pushUnique') {
		return sql`${column} || array(select e from unnest(${given}) with ordinality as o(e, i) where e <> all(${column}) group by e order by min(i))`
	}
	return sql`array(select e from unnest(${column}) with ordinality as o(e, i) where e <> all(${given}) order by i)`
}

/** An update's computed assignments, `null` counting as 0. */
export function computed(
	catalog: Catalog,
	table: Table,
	compute: { readonly [field: string]: Arithmetic | ListUpdate } = {},
): Sql[] {
	return Object.entries(compute).map(([field, operation]) => {
		const column = sql.id(catalog.column(table, field))
		const kind = catalog.kind(table, field)
		if ('elements' in operation) {
			return sql`${column} = ${listed(column, operation, kind)}`
		}
		const operand = value(kind, operation.by)
		return sql`${column} = coalesce(${column}, 0) ${sql.raw(operators[operation.operation])} ${operand}`
	})
}

/**
 * PostgreSQL's numeric overflow, 22003, names no column: the error names
 * the write's first computed number.
 */
export function overflowed(given: Write, error: unknown): unknown {
	const code =
		error instanceof Error && 'code' in error ? error.code : undefined
	if (code !== '22003') return error
	for (const change of given.changes) {
		if (change.kind !== 'update') continue
		const computes = Object.entries(change.compute ?? {})
		const [field] = computes.find(([, operation]) => 'by' in operation) ?? []
		if (field !== undefined) return new OutOfRange(change.model, field)
	}
	return error
}
