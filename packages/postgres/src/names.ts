// Storage names (D-63, D-98): snake_case tables and columns that `dbName`
// overrides, the join tables of many-to-many relations, and constraint
// names that fit PostgreSQL's 63 bytes.
import { createHash } from 'node:crypto'
import type {
	IndexValue,
	IndexWhere,
	ScalarType,
	Schema,
	SchemaField,
	SchemaModel,
} from 'ultimabase'
import { literal } from './fills.ts'
import { id } from './plan-parts.ts'

/**
 * What a column holds: `id` and a `one` key hold uuids, a list the array of
 * its elements' type (D-127), an integer field `integer` (D-132).
 */
export type Kind =
	ScalarType | 'id' | 'integer' | 'text[]' | 'double precision[]' | 'integer[]'

export type Unique = {
	readonly name: string
	readonly fields: readonly string[]
	/** A case-insensitive key compares its text columns lowered (D-170). */
	readonly lower?: true
	/** A partial key's predicate: the rows it keeps (D-215). */
	readonly where?: string
}

export type Table = {
	readonly name: string
	readonly model: SchemaModel
	readonly fields: ReadonlyMap<string, SchemaField>
	/**
	 * The primary key, unique fields, unique indexes, one-to-one keys, the
	 * case-insensitive keys (D-170) and the partial ones (D-215).
	 */
	readonly uniques: readonly Unique[]
}

/**
 * A many-to-many side: the relation its join table is named after, the join
 * table, the column of this side's ids and of the other's, and the tables
 * those ids belong to.
 */
export type Join = {
	readonly relation: string
	readonly table: string
	readonly self: string
	readonly other: string
	readonly owner: string
	readonly target: string
}

const system: ReadonlyMap<string, readonly [string, Kind]> = new Map([
	['id', ['id', 'id']],
	['createdAt', ['created_at', 'dateTime']],
	['updatedAt', ['updated_at', 'dateTime']],
])

export function snake(name: string): string {
	return name
		.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase()
}

const hash = (text: string): string =>
	createHash('sha256').update(text).digest('hex').slice(0, 8)

const valueOf = (value: Exclude<IndexValue, null>): string => {
	if (value instanceof Date)
		return `${literal(value.toISOString())}::timestamptz`
	return typeof value === 'string' ? literal(value) : String(value)
}

/** A partial key's predicate; `not` leaves out `null`, as SQL's `<>` (D-215). */
function predicate(where: IndexWhere, column: (field: string) => string) {
	return Object.entries(where)
		.map(([field, condition]) => {
			const at = id(column(field))
			const not = !('equals' in condition)
			const value = 'equals' in condition ? condition.equals : condition.not
			if (value === null) return `${at} is ${not ? 'not ' : ''}null`
			return `${at} ${not ? '<>' : '='} ${valueOf(value)}`
		})
		.join(' and ')
}

/** A name PostgreSQL keeps whole: a long one ends with its hash. */
export function constraint(name: string): string {
	if (Buffer.byteLength(name) <= 63) return name
	let head = name
	while (Buffer.byteLength(head) > 54) head = head.slice(0, -1)
	return `${head}_${hash(name)}`
}

/** The relation field a foreign key belongs to, and the model it links. */
export type Relation = {
	readonly model: string
	readonly field: string
	readonly target: string
}

/** The row's relation a `within` key's refusal reports, and its message. */
export type Within = { readonly field: string; readonly message: string }

export class Catalog {
	readonly tables: ReadonlyMap<string, Table>
	readonly joins: ReadonlyMap<string, Join>
	/** Constraint name → the model and fields a refusal reports. */
	readonly uniques: ReadonlyMap<string, { model: string; fields: string[] }>
	/** Foreign key name → the relation a refusal reports (D-99). */
	readonly foreignKeys: ReadonlyMap<string, Relation>
	/** A `within` key's name → the issue a refusal reports (D-220). */
	readonly withins: ReadonlyMap<string, Within>
	/** The text search configuration of `_search` (D-148). */
	readonly language: string

	constructor(schema: Schema, language = 'simple') {
		this.language = language
		const tables = new Map<string, Table>()
		for (const model of schema.models) {
			const name = model.dbName ?? snake(model.name)
			const fields = new Map(model.fields.map((field) => [field.name, field]))
			tables.set(model.name, { name, model, fields, uniques: [] })
		}
		this.tables = tables
		const uniques = new Map<string, { model: string; fields: string[] }>()
		for (const table of tables.values()) {
			const sets: {
				fields: readonly string[]
				lower: boolean
				where?: string
			}[] = [{ fields: ['id'], lower: false }]
			for (const field of table.model.fields) {
				const stored =
					field.kind === 'scalar' || (field.kind === 'one' && field.stored)
				if (stored && field.unique)
					sets.push({ fields: [field.name], lower: false })
			}
			const column = (field: string) => this.column(table, field)
			for (const { unique, fields, mode, where } of table.model.indexes) {
				if (!unique) continue
				const lower = mode === 'insensitive'
				sets.push(
					where === undefined
						? { fields, lower }
						: { fields, lower, where: predicate(where, column) },
				)
			}
			const named = sets.map(({ fields, lower, where }, at): Unique => {
				const columns = fields.map(column)
				// A partial key's name tells its predicate apart (D-215).
				const part = where === undefined ? '' : `_${hash(where)}`
				const key = `${table.name}_${columns.join('_')}${lower ? '_lower' : ''}${part}_key`
				const name = constraint(at === 0 ? `${table.name}_pkey` : key)
				return {
					name,
					fields,
					...(lower ? { lower } : {}),
					...(where === undefined ? {} : { where }),
				}
			})
			tables.set(table.model.name, { ...table, uniques: named })
			for (const { name, fields } of named) {
				uniques.set(name, { model: table.model.name, fields: [...fields] })
			}
		}
		this.uniques = uniques
		this.joins = this.joinsOf()
		this.foreignKeys = this.foreignKeysOf()
		this.withins = this.withinsOf()
	}

	table(model: string): Table {
		const table = this.tables.get(model)
		if (table === undefined) throw new Error(`Unknown model ${model}.`)
		return table
	}

	/** The column of a system field, a scalar or a stored `one`. */
	column(table: Table, name: string): string {
		const known = system.get(name)
		if (known !== undefined) return known[0]
		const field = table.fields.get(name)
		if (field?.kind === 'scalar') return field.dbName ?? snake(name)
		if (field?.kind === 'one' && field.stored) {
			return field.dbName ?? `${snake(name)}_id`
		}
		throw new Error(`${table.model.name}.${name} has no column.`)
	}

	kind(table: Table, name: string): Kind {
		const known = system.get(name)
		if (known !== undefined) return known[1]
		const field = table.fields.get(name)
		if (field?.kind !== 'scalar') return 'id'
		if (field.integer === true) return field.list ? 'integer[]' : 'integer'
		if (!field.list) return field.type
		return field.type === 'number' ? 'double precision[]' : 'text[]'
	}

	join(model: string, field: string): Join {
		const join = this.joins.get(`${model}.${field}`)
		if (join === undefined) throw new Error(`${model}.${field} has no join.`)
		return join
	}

	/** Named as the snapshot names them: a `one` key, a join's column. */
	private foreignKeysOf(): Map<string, Relation> {
		const keys = new Map<string, Relation>()
		for (const table of this.tables.values()) {
			const model = table.model.name
			for (const field of table.model.fields) {
				let key: string
				if (field.kind === 'one' && field.stored) {
					key = `${table.name}_${this.column(table, field.name)}_fkey`
				} else if (
					field.kind === 'many' &&
					field.join &&
					field.from === undefined
				) {
					const join = this.join(model, field.name)
					key = `${join.table}_${join.other}_fkey`
				} else continue
				const target = field.target
				keys.set(constraint(key), { model, field: field.name, target })
			}
		}
		return keys
	}

	/** Named as the snapshot names them, with the kernel's message. */
	private withinsOf(): Map<string, Within> {
		const withins = new Map<string, Within>()
		for (const table of this.tables.values()) {
			for (const field of table.model.fields) {
				if (field.kind !== 'one' || field.within === undefined) continue
				const column = this.column(table, field.name)
				const within = {
					field: field.name,
					message: `${table.model.name}.${field.name} needs a ${field.target} of the same ${field.within.target}.`,
				}
				for (const kind of ['fkey', 'check']) {
					withins.set(
						constraint(`${table.name}_${column}_within_${kind}`),
						within,
					)
				}
			}
		}
		return withins
	}

	/**
	 * Both sides of each many-to-many, named after the side whose table sorts
	 * first, so a model renamed with its `dbName` keeps its join (D-98).
	 */
	private joinsOf(): Map<string, Join> {
		const joins = new Map<string, Join>()
		for (const table of this.tables.values()) {
			for (const field of table.model.fields) {
				// A view has no join of its own (D-151).
				if (field.kind !== 'many' || !field.join || field.from !== undefined)
					continue
				const target = this.table(field.target)
				const self = table === target
				const first = self
					? field.name < field.inverse
					: table.name < target.name
				if (!first) continue
				const name = `${table.name}_${snake(field.name)}`
				const mine = self ? `${snake(field.inverse)}_id` : `${table.name}_id`
				const theirs = self ? `${snake(field.name)}_id` : `${target.name}_id`
				const relation = `${table.model.name}.${field.name}`
				joins.set(relation, {
					relation,
					table: name,
					self: mine,
					other: theirs,
					owner: table.name,
					target: target.name,
				})
				joins.set(`${target.model.name}.${field.inverse}`, {
					relation,
					table: name,
					self: theirs,
					other: mine,
					owner: target.name,
					target: table.name,
				})
			}
		}
		return joins
	}
}
