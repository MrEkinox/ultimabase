// Ids read without their rows (D-336): outside a transaction a committed key
// names a row (D-320), so an include that asks its targets' ids alone, of
// every target, reads the keys and leaves the target out.
import { sql } from './text.ts'
import type { Nested, SchemaField } from 'ultimabase'
import type { Filters, Reach } from './filter.ts'
import type { Catalog, Table } from './names.ts'

type Many = Extract<SchemaField, { readonly kind: 'many' }>

/** Whether `nested` reads its rows' ids alone, of every row, from committed keys. */
export function idsAlone(filters: Filters, nested: Nested): boolean {
	const { where, fields, include, count } = nested
	return (
		filters.committed &&
		fields !== undefined &&
		fields.every((name) => name === 'id') &&
		Object.keys(where ?? {}).length === 0 &&
		Object.keys(include ?? {}).length === 0 &&
		Object.keys(count ?? {}).length === 0
	)
}

/**
 * A plain `many` join's rows, aliased `to`, as the ids the join holds, when
 * `nested` reads nothing else of them, from no cursor, in `id` order.
 */
export function linked(
	filters: Filters,
	catalog: Catalog,
	table: Table,
	alias: string,
	field: Many,
	to: string,
	nested: Nested,
): Reach | undefined {
	const byId = (nested.orderBy ?? []).every(
		(each) =>
			each.field === 'id' &&
			each.through === undefined &&
			each.count === undefined &&
			each.relevance === undefined,
	)
	if (
		!field.join ||
		field.from !== undefined ||
		field.filtered === true ||
		nested.cursor !== undefined ||
		!byId ||
		!idsAlone(filters, nested)
	) {
		return undefined
	}
	const join = catalog.join(table.model.name, field.name)
	filters.tables.add(join.table)
	const link = filters.alias()
	const ids = sql`select ${sql.id(link, join.other)} as "id" from ${sql.id(join.table)} as ${sql.id(link)} where ${sql.id(link, join.self)} = ${sql.id(alias, 'id')}`
	return { from: sql`(${ids}) as ${sql.id(to)}`, on: sql`true` }
}
