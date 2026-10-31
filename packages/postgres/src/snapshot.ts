// What PostgreSQL makes of the models (D-98, D-105): every table with its
// columns, keys, checks, indexes and foreign keys, as JSON that `plan`
// compares and that a database or `migrations/schema.json` keeps.
import type { ScalarType, SchemaField } from 'ultimabase'
import type { Catalog, Table } from './names.ts'
import { constraint } from './names.ts'
import { Refused } from 'ultimabase'

/** `field` is the model's name for it, which messages use. */
export type Column = {
	readonly field: string
	readonly type: string
	readonly nullable: boolean
}

export type ForeignKey = {
	readonly column: string
	readonly table: string
	readonly cascade: boolean
}

/** A column among `values`; each element of a list's (D-127). */
export type Check = {
	readonly column: string
	readonly values: string[]
	readonly list?: true
}

/**
 * `model` is the model's name, or `Book.tags` for a join table. Constraints
 * and indexes are keyed by name, columns in table order.
 */
export type TableSnapshot = {
	readonly model: string
	readonly columns: { readonly [name: string]: Column }
	readonly primaryKey: { readonly name: string; readonly columns: string[] }
	readonly uniques: { readonly [name: string]: string[] }
	readonly checks: { readonly [name: string]: Check }
	readonly indexes: { readonly [name: string]: string[] }
	/** A `contains` index's name → its column (D-141). */
	readonly trigrams: { readonly [name: string]: string }
	readonly foreignKeys: { readonly [name: string]: ForeignKey }
	/** The `_search` column, from these columns, and its GIN index (D-148). */
	readonly search: Search | null
	/** The case-insensitive keys' columns, absent when none (D-170). */
	readonly lowerUniques?: { readonly [name: string]: string[] }
}

export type Search = {
	readonly index: string
	readonly language: string
	readonly columns: string[]
}

export type Snapshot = {
	readonly postgres: 1
	readonly tables: { readonly [name: string]: TableSnapshot }
}

const types: { readonly [type in ScalarType]: string } = {
	string: 'text collate "C"',
	number: 'double precision',
	decimal: 'numeric',
	boolean: 'boolean',
	dateTime: 'timestamptz',
	date: 'date',
	json: 'jsonb',
	enum: 'text collate "C"',
}

/** A list's column: an enum's is text, as its single values (D-98, D-127). */
const lists: { readonly [type in ScalarType]?: string } = {
	string: 'text[]',
	number: 'double precision[]',
	enum: 'text[]',
}

type Building = {
	model: string
	columns: Record<string, Column>
	primaryKey: { name: string; columns: string[] }
	uniques: Record<string, string[]>
	checks: Record<string, Check>
	indexes: Record<string, string[]>
	trigrams: Record<string, string>
	foreignKeys: Record<string, ForeignKey>
	search: Search | null
	lowerUniques?: Record<string, string[]>
}

type Claim = (name: string, what: string) => string

/** Refuses two things stored under one name (D-98). */
function claimer(): Claim {
	const owners = new Map<string, string>()
	return (name, what) => {
		const prior = owners.get(name)
		if (prior !== undefined) {
			throw new Refused(`${prior} and ${what} are both stored as "${name}".`)
		}
		owners.set(name, what)
		return name
	}
}

/** Tables, keys and indexes share a schema's names; columns, a table's. */
type Claims = { readonly schema: Claim; readonly columns: Claim }

function empty(
	claims: Claims,
	model: string,
	table: string,
	keys: string[],
): Building {
	const name = claims.schema(constraint(`${table}_pkey`), `the key of ${model}`)
	return {
		model,
		columns: {},
		primaryKey: { name, columns: keys },
		uniques: {},
		checks: {},
		indexes: {},
		trigrams: {},
		foreignKeys: {},
		search: null,
	}
}

function index(
	claims: Claims,
	building: Building,
	table: string,
	columns: string[],
	what: string,
): void {
	const name = constraint(`${table}_${columns.join('_')}_idx`)
	building.indexes[claims.schema(name, `the index on ${what}`)] = columns
}

function field(
	catalog: Catalog,
	claims: Claims,
	table: Table,
	building: Building,
	given: SchemaField,
): void {
	if (given.kind === 'many' || (given.kind === 'one' && !given.stored)) return
	const what = `${table.model.name}.${given.name}`
	const column = claims.columns(catalog.column(table, given.name), what)
	const type =
		given.kind === 'one'
			? 'uuid'
			: given.integer === true
				? `integer${given.list ? '[]' : ''}`
				: given.type === 'decimal'
					? `numeric(${given.precision},${given.scale})`
					: ((given.list ? lists[given.type] : undefined) ?? types[given.type])
	building.columns[column] = {
		field: given.name,
		type,
		nullable: given.optional,
	}
	if (given.kind === 'scalar' && given.type === 'enum') {
		const name = constraint(`${table.name}_${column}_check`)
		building.checks[claims.schema(name, `the check on ${what}`)] = {
			column,
			values: [...(given.values ?? [])],
			...(given.list ? { list: true as const } : {}),
		}
	}
	if (given.kind !== 'one') return
	const key = constraint(`${table.name}_${column}_fkey`)
	building.foreignKeys[claims.schema(key, `the foreign key of ${what}`)] = {
		column,
		table: catalog.table(given.target).name,
		cascade: false,
	}
	if (!given.unique) index(claims, building, table.name, [column], what)
}

/** The fields of a key or an index, as `Thing(a, b)`. */
const on = (model: string, fields: readonly string[]) =>
	`${model}(${fields.join(', ')})`

/** The snapshot of the catalog's tables, join tables last. */
export function snapshotOf(catalog: Catalog): Snapshot {
	const tables: Record<string, Building> = {}
	const schema = claimer()
	for (const table of catalog.tables.values()) {
		const model = table.model.name
		const claims = { schema, columns: claimer() }
		schema(table.name, `the table of ${model}`)
		const building = empty(claims, model, table.name, ['id'])
		for (const [column, name, type] of [
			['id', 'id', 'uuid'],
			['created_at', 'createdAt', 'timestamptz'],
			['updated_at', 'updatedAt', 'timestamptz'],
		] as const) {
			claims.columns(column, `${model}.${name}`)
			building.columns[column] = { field: name, type, nullable: false }
		}
		for (const given of table.model.fields) {
			field(catalog, claims, table, building, given)
		}
		const [, ...uniques] = table.uniques
		for (const { name, fields, lower } of uniques) {
			const key = `unique key on ${on(model, fields)}`
			const columns = fields.map((given) => catalog.column(table, given))
			if (lower === undefined) {
				building.uniques[schema(name, `the ${key}`)] = columns
			} else {
				const claimed = schema(name, `the case-insensitive ${key}`)
				;(building.lowerUniques ??= {})[claimed] = columns
			}
		}
		for (const { fields, unique, contains } of table.model.indexes) {
			if (unique) continue
			if (contains) {
				const [column = ''] = fields.map((name) => catalog.column(table, name))
				const name = constraint(`${table.name}_${column}_trgm`)
				const what = `the contains index on ${on(model, fields)}`
				building.trigrams[schema(name, what)] = column
				continue
			}
			const columns = fields.map((name) => catalog.column(table, name))
			index(claims, building, table.name, columns, on(model, fields))
		}
		const searched = table.model.fields.flatMap((given) =>
			given.kind === 'scalar' && given.search === true
				? [catalog.column(table, given.name)]
				: [],
		)
		if (searched.length > 0) {
			claims.columns('_search', `the search of ${model}`)
			const name = constraint(`${table.name}__search_idx`)
			building.search = {
				index: schema(name, `the search index of ${model}`),
				language: catalog.language,
				columns: searched,
			}
		}
		tables[table.name] = building
	}
	for (const [side, join] of catalog.joins) {
		// Both sides of a relation share its table.
		if (side !== join.relation) continue
		const claims = { schema, columns: claimer() }
		schema(join.table, `the join table of ${side}`)
		const building = empty(claims, side, join.table, [join.self, join.other])
		for (const column of [join.self, join.other]) {
			building.columns[column] = {
				field: column,
				type: 'uuid',
				nullable: false,
			}
		}
		for (const [column, table] of [
			[join.self, join.owner],
			[join.other, join.target],
		] as const) {
			const key = constraint(`${join.table}_${column}_fkey`)
			building.foreignKeys[schema(key, `the foreign key of ${side}`)] = {
				column,
				table,
				cascade: true,
			}
		}
		index(claims, building, join.table, [join.other], side)
		tables[join.table] = building
	}
	return { postgres: 1, tables }
}
