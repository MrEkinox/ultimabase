// The changes of a write as statements (D-73), and the unique constraint a
// refused one names as the kernel's `UniqueViolation` (D-98).
import { sql } from 'kysely'
import type { Change } from 'ultimabase'
import { UniqueViolation } from 'ultimabase'
import type { Sql } from './filter.ts'
import { Filters, value } from './filter.ts'
import type { Catalog, Table } from './names.ts'

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

/** The statements of one change. */
export function compileChange(catalog: Catalog, change: Change): Sql[] {
	const table = catalog.table(change.model)
	const name = sql.id(table.name)
	if (change.kind === 'insert') {
		const pairs = assignments(catalog, table, change.row)
		const columns = pairs.map(([column]) => sql.id(column))
		const values = pairs.map(([, item]) => item)
		return [
			sql`insert into ${name} (${sql.join(columns)}) values (${sql.join(values)})`,
		]
	}
	if (change.kind === 'update') {
		const filters = new Filters(catalog)
		const alias = filters.alias()
		const set = assignments(catalog, table, change.set).map(
			([column, item]) => sql`${sql.id(column)} = ${item}`,
		)
		const where = filters.where(change.model, alias, change.where)
		return [
			sql`update ${name} as ${sql.id(alias)} set ${sql.join(set)} where ${where}`,
		]
	}
	if (change.kind === 'delete') {
		const filters = new Filters(catalog)
		const alias = filters.alias()
		const where = filters.where(change.model, alias, change.where)
		return [sql`delete from ${name} as ${sql.id(alias)} where ${where}`]
	}
	return links(catalog, change)
}

/** A link or unlink of nothing has no statement. */
function links(
	catalog: Catalog,
	change: Extract<Change, { readonly kind: 'link' | 'unlink' }>,
): Sql[] {
	if (change.targets.length === 0) return []
	const join = catalog.join(change.model, change.field)
	const self = sql.id(join.self)
	const other = sql.id(join.other)
	if (change.kind === 'unlink') {
		const targets = sql.join(change.targets.map((id) => sql`${id}`))
		return [
			sql`delete from ${sql.id(join.table)} where ${self} = ${change.id} and ${other} in (${targets})`,
		]
	}
	const rows = change.targets.map((id) => sql`(${change.id}, ${id})`)
	return [
		sql`insert into ${sql.id(join.table)} (${self}, ${other}) values ${sql.join(rows)} on conflict do nothing`,
	]
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
