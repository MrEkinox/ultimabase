// The tables of a new database (D-98): columns, keys and checks first, then
// the join tables, then the deferred foreign keys and the indexes.
import { sql } from 'kysely'
import type { SchemaField } from 'ultimabase'
import type { Sql } from './filter.ts'
import type { Catalog, Table } from './names.ts'
import { constraint } from './names.ts'

const types = {
	string: sql`text collate "C"`,
	number: sql`double precision`,
	boolean: sql`boolean`,
	date: sql`timestamptz`,
	json: sql`jsonb`,
	enum: sql`text collate "C"`,
}

const deferred = sql`deferrable initially deferred`

/** Every table the schema stores, join tables included. */
export function tableNames(catalog: Catalog): string[] {
	const joins = [...catalog.joins.values()].map((join) => join.table)
	const tables = [...catalog.tables.values()].map((table) => table.name)
	return [...new Set([...tables, ...joins])]
}

function definition(catalog: Catalog, table: Table, field: SchemaField): Sql[] {
	if (field.kind === 'many' || (field.kind === 'one' && !field.stored)) {
		return []
	}
	const column = catalog.column(table, field.name)
	const type = field.kind === 'one' ? sql`uuid` : types[field.type]
	const nullable = field.optional ? sql`` : sql` not null`
	const parts = [sql`${sql.id(column)} ${type}${nullable}`]
	if (field.kind === 'scalar' && field.type === 'enum') {
		const values = (field.values ?? []).map((item) => sql.lit(item))
		const name = constraint(`${table.name}_${column}_check`)
		parts.push(
			sql`constraint ${sql.id(name)} check (${sql.id(column)} in (${sql.join(values)}))`,
		)
	}
	return parts
}

function create(catalog: Catalog, table: Table): Sql {
	const [, ...uniques] = table.uniques
	const pkey = constraint(`${table.name}_pkey`)
	const parts: Sql[] = [
		sql`"id" uuid not null`,
		sql`"created_at" timestamptz not null`,
		sql`"updated_at" timestamptz not null`,
		...table.model.fields.flatMap((field) => definition(catalog, table, field)),
		sql`constraint ${sql.id(pkey)} primary key ("id")`,
		...uniques.map(({ name, fields }) => {
			const columns = fields.map((field) =>
				sql.id(catalog.column(table, field)),
			)
			return sql`constraint ${sql.id(name)} unique (${sql.join(columns)})`
		}),
	]
	return sql`create table ${sql.id(table.name)} (${sql.join(parts)})`
}

function index(table: string, column: string): Sql {
	const name = constraint(`${table}_${column}_idx`)
	return sql`create index ${sql.id(name)} on ${sql.id(table)} (${sql.id(column)})`
}

function foreignKey(
	table: string,
	column: string,
	target: string,
	cascade: boolean,
): Sql {
	const name = constraint(`${table}_${column}_fkey`)
	const action = cascade ? sql` on delete cascade` : sql``
	return sql`alter table ${sql.id(table)} add constraint ${sql.id(name)} foreign key (${sql.id(column)}) references ${sql.id(target)} ("id")${action} ${deferred}`
}

/** The statements that create the schema's tables, in order. */
export function createTables(catalog: Catalog): Sql[] {
	const tables = [...catalog.tables.values()]
	const statements = tables.map((table) => create(catalog, table))
	const after: Sql[] = []
	for (const table of tables) {
		for (const field of table.model.fields) {
			if (field.kind !== 'one' || !field.stored) continue
			const column = catalog.column(table, field.name)
			const target = catalog.table(field.target).name
			after.push(foreignKey(table.name, column, target, false))
			if (!field.unique) after.push(index(table.name, column))
		}
	}
	const created = new Set<string>()
	for (const join of catalog.joins.values()) {
		if (created.has(join.table)) continue
		created.add(join.table)
		const pkey = constraint(`${join.table}_pkey`)
		statements.push(
			sql`create table ${sql.id(join.table)} (${sql.id(join.self)} uuid not null, ${sql.id(join.other)} uuid not null, constraint ${sql.id(pkey)} primary key (${sql.id(join.self)}, ${sql.id(join.other)}))`,
		)
		after.push(
			foreignKey(join.table, join.self, join.owner, true),
			foreignKey(join.table, join.other, join.target, true),
			index(join.table, join.other),
		)
	}
	return [...statements, ...after]
}
