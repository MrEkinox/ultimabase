// What PostgreSQL makes of the models (D-98, D-105): every table with its
// columns, keys, checks, indexes and foreign keys, as JSON that `plan`
// compares and that a database or `migrations/schema.json` keeps.
import type { SchemaField } from 'ultimabase'
import type { Catalog, Table } from './names.ts'
import { constraint } from './names.ts'

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

export type Check = { readonly column: string; readonly values: string[] }

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
	readonly foreignKeys: { readonly [name: string]: ForeignKey }
}

export type Snapshot = {
	readonly postgres: 1
	readonly tables: { readonly [name: string]: TableSnapshot }
}

const types = {
	string: 'text collate "C"',
	number: 'double precision',
	boolean: 'boolean',
	date: 'timestamptz',
	json: 'jsonb',
	enum: 'text collate "C"',
}

type Building = {
	model: string
	columns: Record<string, Column>
	primaryKey: { name: string; columns: string[] }
	uniques: Record<string, string[]>
	checks: Record<string, Check>
	indexes: Record<string, string[]>
	foreignKeys: Record<string, ForeignKey>
}

function empty(model: string, table: string, keys: string[]): Building {
	return {
		model,
		columns: {},
		primaryKey: { name: constraint(`${table}_pkey`), columns: keys },
		uniques: {},
		checks: {},
		indexes: {},
		foreignKeys: {},
	}
}

function index(building: Building, table: string, columns: string[]): void {
	building.indexes[constraint(`${table}_${columns.join('_')}_idx`)] = columns
}

function field(
	catalog: Catalog,
	table: Table,
	building: Building,
	given: SchemaField,
): void {
	if (given.kind === 'many' || (given.kind === 'one' && !given.stored)) return
	const column = catalog.column(table, given.name)
	const type = given.kind === 'one' ? 'uuid' : types[given.type]
	building.columns[column] = {
		field: given.name,
		type,
		nullable: given.optional,
	}
	if (given.kind === 'scalar' && given.type === 'enum') {
		building.checks[constraint(`${table.name}_${column}_check`)] = {
			column,
			values: [...(given.values ?? [])],
		}
	}
	if (given.kind !== 'one') return
	building.foreignKeys[constraint(`${table.name}_${column}_fkey`)] = {
		column,
		table: catalog.table(given.target).name,
		cascade: false,
	}
	if (!given.unique) index(building, table.name, [column])
}

/** The snapshot of the catalog's tables, join tables last. */
export function snapshotOf(catalog: Catalog): Snapshot {
	const tables: Record<string, Building> = {}
	for (const table of catalog.tables.values()) {
		const building = empty(table.model.name, table.name, ['id'])
		for (const [column, name, type] of [
			['id', 'id', 'uuid'],
			['created_at', 'createdAt', 'timestamptz'],
			['updated_at', 'updatedAt', 'timestamptz'],
		] as const) {
			building.columns[column] = { field: name, type, nullable: false }
		}
		for (const given of table.model.fields) {
			field(catalog, table, building, given)
		}
		const [, ...uniques] = table.uniques
		for (const { name, fields } of uniques) {
			building.uniques[name] = fields.map((given) =>
				catalog.column(table, given),
			)
		}
		for (const { fields, unique } of table.model.indexes) {
			if (unique) continue
			const columns = fields.map((name) => catalog.column(table, name))
			index(building, table.name, columns)
		}
		tables[table.name] = building
	}
	for (const [relation, join] of catalog.joins) {
		if (tables[join.table] !== undefined) continue
		const building = empty(relation, join.table, [join.self, join.other])
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
			building.foreignKeys[constraint(`${join.table}_${column}_fkey`)] = {
				column,
				table,
				cascade: true,
			}
		}
		index(building, join.table, [join.other])
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
		? { column: value['column'], values: value['values'] }
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

function tableOf(value: unknown): TableSnapshot | undefined {
	if (!isRecord(value)) return undefined
	const key = value['primaryKey']
	const columns = entries(value['columns'], columnOf)
	const uniques = entries(value['uniques'], stringsOf)
	const checks = entries(value['checks'], checkOf)
	const indexes = entries(value['indexes'], stringsOf)
	const foreignKeys = entries(value['foreignKeys'], foreignKeyOf)
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
		foreignKeys === undefined
	) {
		return undefined
	}
	const primaryKey = { name: key['name'], columns: key['columns'] }
	return { model, columns, primaryKey, uniques, checks, indexes, foreignKeys }
}

/** A snapshot read back from a database or a file, checked. */
export function parseSnapshot(value: unknown): Snapshot {
	const tables = isRecord(value) ? entries(value['tables'], tableOf) : undefined
	if (!isRecord(value) || value['postgres'] !== 1 || tables === undefined) {
		throw new Error('The schema snapshot is not one postgres() wrote.')
	}
	return { postgres: 1, tables }
}
