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
	date: 'timestamptz',
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
		for (const { name, fields } of uniques) {
			const what = `the unique key on ${on(model, fields)}`
			building.uniques[schema(name, what)] = fields.map((given) =>
				catalog.column(table, given),
			)
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isStrings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Each entry of a record, checked by `read`, or `undefined`. */
function entries<T>(
	value: unknown,
	read: (item: unknown) => T | undefined,
): Record<string, T> | undefined {
	if (!isRecord(value)) return undefined
	const result: Record<string, T> = {}
	for (const [key, item] of Object.entries(value)) {
		const checked = read(item)
		if (checked === undefined) return undefined
		result[key] = checked
	}
	return result
}

const columnOf = (value: unknown): Column | undefined =>
	isRecord(value) &&
	typeof value['field'] === 'string' &&
	typeof value['type'] === 'string' &&
	typeof value['nullable'] === 'boolean'
		? {
				field: value['field'],
				type: value['type'],
				nullable: value['nullable'],
			}
		: undefined

const checkOf = (value: unknown): Check | undefined =>
	isRecord(value) &&
	typeof value['column'] === 'string' &&
	isStrings(value['values'])
		? {
				column: value['column'],
				values: value['values'],
				...(value['list'] === true ? { list: true as const } : {}),
			}
		: undefined

const foreignKeyOf = (value: unknown): ForeignKey | undefined =>
	isRecord(value) &&
	typeof value['column'] === 'string' &&
	typeof value['table'] === 'string' &&
	typeof value['cascade'] === 'boolean'
		? {
				column: value['column'],
				table: value['table'],
				cascade: value['cascade'],
			}
		: undefined

const stringsOf = (value: unknown): string[] | undefined =>
	isStrings(value) ? value : undefined

/** A search, `null` for none, or `undefined` when it is neither. */
const searchOf = (value: unknown): Search | null | undefined =>
	value === null
		? null
		: isRecord(value) &&
			  typeof value['index'] === 'string' &&
			  typeof value['language'] === 'string' &&
			  isStrings(value['columns'])
			? {
					index: value['index'],
					language: value['language'],
					columns: value['columns'],
				}
			: undefined

function tableOf(value: unknown): TableSnapshot | undefined {
	if (!isRecord(value)) return undefined
	const key = value['primaryKey']
	const columns = entries(value['columns'], columnOf)
	const uniques = entries(value['uniques'], stringsOf)
	const checks = entries(value['checks'], checkOf)
	const indexes = entries(value['indexes'], stringsOf)
	const trigrams = entries(value['trigrams'], (item) =>
		typeof item === 'string' ? item : undefined,
	)
	const foreignKeys = entries(value['foreignKeys'], foreignKeyOf)
	const search = searchOf(value['search'])
	const model = value['model']
	if (
		typeof model !== 'string' ||
		!isRecord(key) ||
		typeof key['name'] !== 'string' ||
		!isStrings(key['columns']) ||
		columns === undefined ||
		uniques === undefined ||
		checks === undefined ||
		indexes === undefined ||
		trigrams === undefined ||
		foreignKeys === undefined ||
		search === undefined
	) {
		return undefined
	}
	const primaryKey = { name: key['name'], columns: key['columns'] }
	return {
		model,
		columns,
		primaryKey,
		uniques,
		checks,
		indexes,
		trigrams,
		foreignKeys,
		search,
	}
}

/** A snapshot read back from a database or a file, checked. */
export function parseSnapshot(value: unknown): Snapshot {
	const tables = isRecord(value) ? entries(value['tables'], tableOf) : undefined
	if (!isRecord(value) || value['postgres'] !== 1 || tables === undefined) {
		throw new Error('The schema snapshot is not one postgres() wrote.')
	}
	return { postgres: 1, tables }
}
