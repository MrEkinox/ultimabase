// Storage names (D-63, D-98): snake_case tables and columns that `dbName`
// overrides, the join tables of many-to-many relations, and constraint
// names that fit PostgreSQL's 63 bytes.
import { createHash } from 'node:crypto'
import type { ScalarType, Schema, SchemaField, SchemaModel } from 'ultimabase'

/**
 * What a column holds: `id` and a `one` key hold uuids, a list the array of
 * its elements' type (D-127).
 */
export type Kind = ScalarType | 'id' | 'text[]' | 'double precision[]'

export type Unique = {
	readonly name: string
	readonly fields: readonly string[]
}

export type Table = {
	readonly name: string
	readonly model: SchemaModel
	readonly fields: ReadonlyMap<string, SchemaField>
	/** The primary key, unique fields, unique indexes, one-to-one keys. */
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
	['createdAt', ['created_at', 'date']],
	['updatedAt', ['updated_at', 'date']],
])

export function snake(name: string): string {
	return name
		.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase()
}

/** A name PostgreSQL keeps whole: a long one ends with its hash. */
export function constraint(name: string): string {
	if (Buffer.byteLength(name) <= 63) return name
	let head = name
	while (Buffer.byteLength(head) > 54) head = head.slice(0, -1)
	const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
	return `${head}_${hash}`
}

/** The relation field a foreign key belongs to, and the model it links. */
export type Relation = {
	readonly model: string
	readonly field: string
	readonly target: string
}

export class Catalog {
	readonly tables: ReadonlyMap<string, Table>
	readonly joins: ReadonlyMap<string, Join>
	/** Constraint name → the model and fields a refusal reports. */
	readonly uniques: ReadonlyMap<string, { model: string; fields: string[] }>
	/** Foreign key name → the relation a refusal reports (D-99). */
	readonly foreignKeys: ReadonlyMap<string, Relation>

	constructor(schema: Schema) {
		const tables = new Map<string, Table>()
		for (const model of schema.models) {
			const name = model.dbName ?? snake(model.name)
			const fields = new Map(model.fields.map((field) => [field.name, field]))
			tables.set(model.name, { name, model, fields, uniques: [] })
		}
		this.tables = tables
		const uniques = new Map<string, { model: string; fields: string[] }>()
		for (const table of tables.values()) {
			const sets: (readonly string[])[] = [['id']]
			for (const field of table.model.fields) {
				const stored =
					field.kind === 'scalar' || (field.kind === 'one' && field.stored)
				if (stored && field.unique) sets.push([field.name])
			}
			for (const index of table.model.indexes) {
				if (index.unique) sets.push(index.fields)
			}
			const named = sets.map((fields, at) => ({
				name: constraint(
					at === 0
						? `${table.name}_pkey`
						: `${table.name}_${fields.map((field) => this.column(table, field)).join('_')}_key`,
				),
				fields,
			}))
			tables.set(table.model.name, { ...table, uniques: named })
			for (const { name, fields } of named) {
				uniques.set(name, { model: table.model.name, fields: [...fields] })
			}
		}
		this.uniques = uniques
		this.joins = this.joinsOf()
		this.foreignKeys = this.foreignKeysOf()
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
				} else if (field.kind === 'many' && field.join) {
					const join = this.join(model, field.name)
					key = `${join.table}_${join.other}_fkey`
				} else continue
				const target = field.target
				keys.set(constraint(key), { model, field: field.name, target })
			}
		}
		return keys
	}

	/**
	 * Both sides of each many-to-many, named after the side whose table sorts
	 * first, so a model renamed with its `dbName` keeps its join (D-98).
	 */
	private joinsOf(): Map<string, Join> {
		const joins = new Map<string, Join>()
		for (const table of this.tables.values()) {
			for (const field of table.model.fields) {
				if (field.kind !== 'many' || !field.join) continue
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
