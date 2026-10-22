// A normalized `where` as SQL (D-73): PostgreSQL's three-valued logic is the
// one `memory()` mimics, and a relation condition is an `exists` subquery.
import type { RawBuilder } from 'kysely'
import { sql } from 'kysely'
import type { Condition, Filter, SchemaField } from 'ultimabase'
import type { Catalog, Kind, Table } from './names.ts'

export type Sql = RawBuilder<unknown>

type Relation = Extract<SchemaField, { readonly kind: 'one' | 'many' }>

/** The rows a relation reaches: `from`, then what ties them to the row. */
export type Reach = { readonly from: Sql; readonly on: Sql }

export const uuid: RegExp =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function all(parts: readonly Sql[]): Sql {
	if (parts.length === 0) return sql`true`
	return parts.length === 1
		? (parts[0] ?? sql`true`)
		: sql`(${sql.join(parts, sql` and `)})`
}

function any(parts: readonly Sql[]): Sql {
	if (parts.length === 0) return sql`false`
	return sql`(${sql.join(parts, sql` or `)})`
}

/** A value as a parameter of its column's type. */
export function value(kind: Kind, item: unknown): Sql {
	if (kind === 'json' && item !== null) {
		return sql`cast(${JSON.stringify(item)} as jsonb)`
	}
	return sql`${item}`
}

function isFilters(
	item: Condition | readonly Filter[],
): item is readonly Filter[] {
	return Array.isArray(item)
}

/** `%`, `_` and `\` are characters, not patterns (D-94). */
function pattern(operand: unknown, before: string, after: string): string {
	const text = typeof operand === 'string' ? operand : ''
	return `${before}${text.replaceAll(/[\\%_]/g, '\\$&')}${after}`
}

export class Filters {
	readonly catalog: Catalog
	/** The tables the compiled conditions reach, besides their own. */
	readonly tables: Set<string> = new Set()
	private next = 0

	constructor(catalog: Catalog) {
		this.catalog = catalog
	}

	/** A table alias no other part of the statement uses. */
	alias(): string {
		this.next += 1
		return `t${this.next}`
	}

	column(table: Table, alias: string, name: string): Sql {
		return sql.id(alias, this.catalog.column(table, name))
	}

	where(model: string, alias: string, filter: Filter | undefined): Sql {
		if (filter === undefined) return sql`true`
		const table = this.catalog.table(model)
		const parts: Sql[] = []
		for (const [key, condition] of Object.entries(filter)) {
			if (condition === undefined) continue
			if (key === 'AND' || key === 'OR' || key === 'NOT') {
				const list = (filter[key] ?? []).map((part) =>
					this.where(model, alias, part),
				)
				if (key === 'AND') parts.push(all(list))
				else if (key === 'OR') parts.push(any(list))
				else parts.push(all(list.map((part) => sql`(not ${part})`)))
			} else if (isFilters(condition)) {
				throw new Error(`${model}.${key} takes a condition, not a list.`)
			} else {
				const field = table.fields.get(key)
				parts.push(
					field === undefined || field.kind === 'scalar'
						? this.scalar(table, alias, key, condition)
						: this.relation(table, alias, field, condition),
				)
			}
		}
		return all(parts)
	}

	/** The rows of `field`'s target, aliased `to`, that `alias`'s row reaches. */
	reach(table: Table, alias: string, field: Relation, to: string): Reach {
		const target = this.catalog.table(field.target)
		this.tables.add(target.name)
		const from = sql`${sql.id(target.name)} as ${sql.id(to)}`
		if (field.kind === 'one' && field.stored) {
			return {
				from,
				on: sql`${sql.id(to, 'id')} = ${this.column(table, alias, field.name)}`,
			}
		}
		if (field.kind === 'many' && field.join) {
			const join = this.catalog.join(table.model.name, field.name)
			this.tables.add(join.table)
			const link = this.alias()
			return {
				from: sql`${from} join ${sql.id(join.table)} as ${sql.id(link)} on ${sql.id(link, join.other)} = ${sql.id(to, 'id')}`,
				on: sql`${sql.id(link, join.self)} = ${sql.id(alias, 'id')}`,
			}
		}
		return {
			from,
			on: sql`${this.column(target, to, field.inverse)} = ${sql.id(alias, 'id')}`,
		}
	}

	private exists(
		table: Table,
		alias: string,
		field: Relation,
		filter: Filter,
		test: (inner: Sql) => Sql = (inner) => inner,
	): Sql {
		const to = this.alias()
		const { from, on } = this.reach(table, alias, field, to)
		const inner = this.where(field.target, to, filter)
		return sql`exists (select from ${from} where ${on} and ${test(inner)})`
	}

	private relation(
		table: Table,
		alias: string,
		field: Relation,
		condition: Condition,
	): Sql {
		const parts: Sql[] = []
		const exists = (filter: Filter) => this.exists(table, alias, field, filter)
		if (condition.is !== undefined) {
			parts.push(
				condition.is === null ? sql`(not ${exists({})})` : exists(condition.is),
			)
		}
		if (condition.isNot !== undefined) {
			parts.push(
				condition.isNot === null
					? exists({})
					: sql`(not ${exists(condition.isNot)})`,
			)
		}
		if (condition.some !== undefined) parts.push(exists(condition.some))
		if (condition.every !== undefined) {
			const failing = this.exists(
				table,
				alias,
				field,
				condition.every,
				(inner) => sql`(${inner}) is false`,
			)
			parts.push(sql`(not ${failing})`)
		}
		if (condition.none !== undefined) {
			parts.push(sql`(not ${exists(condition.none)})`)
		}
		return all(parts)
	}

	private scalar(
		table: Table,
		alias: string,
		name: string,
		condition: Condition,
	): Sql {
		const column = this.column(table, alias, name)
		const kind = this.catalog.kind(table, name)
		const parts: Sql[] = []
		for (const [operator, operand] of Object.entries(condition)) {
			if (operand === undefined) continue
			switch (operator) {
				case 'equals':
				case 'not': {
					const equal =
						operand === null
							? sql`${column} is null`
							: this.equal(column, kind, operand)
					parts.push(operator === 'equals' ? equal : sql`(not ${equal})`)
					break
				}
				case 'in':
				case 'notIn': {
					const found = this.member(column, kind, operand)
					parts.push(operator === 'in' ? found : sql`(not ${found})`)
					break
				}
				case 'contains':
					parts.push(sql`${column} like ${pattern(operand, '%', '%')}`)
					break
				case 'startsWith':
					parts.push(sql`${column} like ${pattern(operand, '', '%')}`)
					break
				case 'endsWith':
					parts.push(sql`${column} like ${pattern(operand, '%', '')}`)
					break
				default: {
					const left = kind === 'id' ? sql`cast(${column} as text)` : column
					const right = value(kind, operand)
					const compare = { lt: '<', lte: '<=', gt: '>', gte: '>=' }[operator]
					if (compare === undefined) {
						throw new Error(`Unknown operator ${operator}.`)
					}
					parts.push(sql`${left} ${sql.raw(compare)} ${right}`)
				}
			}
		}
		return all(parts)
	}

	/** A string that is not an id equals no id, as in `memory()` (D-98). */
	private equal(column: Sql, kind: Kind, operand: unknown): Sql {
		if (kind === 'id' && !(typeof operand === 'string' && uuid.test(operand))) {
			return sql`false`
		}
		return sql`${column} = ${value(kind, operand)}`
	}

	/** `in`: no item is false; an item no known value equals is dropped. */
	private member(column: Sql, kind: Kind, operand: unknown): Sql {
		const list: readonly unknown[] = Array.isArray(operand) ? operand : []
		if (list.length === 0) return sql`false`
		const items = list.filter(
			(item) =>
				item !== null &&
				(kind !== 'id' || (typeof item === 'string' && uuid.test(item))),
		)
		if (items.length === 0) {
			return sql`(case when ${column} is null then null else false end)`
		}
		const values = items.map((item) => value(kind, item))
		return sql`${column} in (${sql.join(values)})`
	}
}
