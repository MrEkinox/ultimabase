// Number updates (D-132): computed by the UPDATE on the row as it finds it,
// and a result outside its column's type refused as the kernel's error.
import type { Arithmetic, Write } from 'ultimabase'
import { OutOfRange } from 'ultimabase'
import type { Sql } from './filter.ts'
import { value } from './filter.ts'
import type { Catalog, Table } from './names.ts'
import { sql } from 'kysely'

// An integer divided by an integer truncates toward zero, as D-132 says.
const operators = { increment: '+', decrement: '-', multiply: '*', divide: '/' }

/** An update's computed assignments, `null` counting as 0. */
export function computed(
	catalog: Catalog,
	table: Table,
	compute: { readonly [field: string]: Arithmetic } = {},
): Sql[] {
	return Object.entries(compute).map(([field, { operation, by }]) => {
		const column = sql.id(catalog.column(table, field))
		const operand = value(catalog.kind(table, field), by)
		return sql`${column} = coalesce(${column}, 0) ${sql.raw(operators[operation])} ${operand}`
	})
}

/**
 * PostgreSQL's numeric overflow, 22003, names no column: the error names
 * the write's first computed field.
 */
export function overflowed(given: Write, error: unknown): unknown {
	const code =
		error instanceof Error && 'code' in error ? error.code : undefined
	if (code !== '22003') return error
	for (const change of given.changes) {
		if (change.kind !== 'update') continue
		const [field] = Object.keys(change.compute ?? {})
		if (field !== undefined) return new OutOfRange(change.model, field)
	}
	return error
}
