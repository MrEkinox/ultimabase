// How `memory()` reads: filters with SQL's three-valued logic, so that a
// `null` compares as PostgreSQL would, then order, cursor and page.
import type {
	Condition,
	Filter,
	Nested,
	Order,
	Row,
	SchemaField,
	Step,
} from './adapter.ts'
import type { Truth } from './memory-conditions.ts'
import { and, isFilters, not, or, scalar } from './memory-conditions.ts'
import { compareKeys, copy, sortable } from './memory-values.ts'
import { relevance, searches } from './memory-search.ts'
import { modelOf } from './query-where.ts'

/** A stored row; a stored `one` key is the target's id or `null`. */
export type StoredRow = {
	readonly id: string
	readonly [field: string]: unknown
}

export type Store = {
	readonly tables: Map<string, Map<string, StoredRow>>
	/** `Model.field` → id → the linked ids, kept on both sides (D-64). */
	readonly joins: Map<string, Map<string, Set<string>>>
}

/** A copy of the store, which a write changes and keeps once whole. */
export function clone(store: Store): Store {
	return {
		tables: new Map(
			[...store.tables].map(([name, table]) => [name, new Map(table)]),
		),
		joins: new Map(
			[...store.joins].map(([key, side]) => [
				key,
				new Map([...side].map(([id, ids]) => [id, new Set(ids)])),
			]),
		),
	}
}

/** Each model's fields by name. */
export type Fields = ReadonlyMap<string, ReadonlyMap<string, SchemaField>>

export class Reader {
	readonly store: Store
	readonly fields: Fields
	/** A write's change index → the ids its delete removed, for `removedBy`. */
	readonly removed: Map<number, ReadonlySet<string>> = new Map()

	constructor(store: Store, fields: Fields) {
		this.store = store
		this.fields = fields
	}

	table(model: string): Map<string, StoredRow> {
		return modelOf(this.store.tables, model)
	}

	field(model: string, name: string): SchemaField | undefined {
		return this.fields.get(model)?.get(name)
	}

	/** The rows a relation of `row` points to. */
	related(model: string, field: SchemaField, row: StoredRow): StoredRow[] {
		if (field.kind === 'scalar') return []
		const target = this.table(field.target)
		if (field.kind === 'one' && field.stored) {
			const key = row[field.name]
			const found = typeof key === 'string' ? target.get(key) : undefined
			return found === undefined ? [] : [found]
		}
		if (field.kind === 'many' && field.join) {
			const ids = this.store.joins.get(`${model}.${field.name}`)?.get(row.id)
			return [...(ids ?? [])].flatMap((id) => target.get(id) ?? [])
		}
		return [...target.values()].filter(
			(other) => other[field.inverse] === row.id,
		)
	}

	matches(model: string, row: StoredRow, filter: Filter | undefined): Truth {
		if (filter === undefined) return true
		const truths: Truth[] = []
		for (const [key, value] of Object.entries(filter)) {
			if (value === undefined) continue
			if (key === 'AND' || key === 'OR' || key === 'NOT') {
				const parts = (filter[key] ?? []).map((part) =>
					this.matches(model, row, part),
				)
				if (key === 'AND') truths.push(and(parts))
				else if (key === 'OR') truths.push(or(parts))
				else truths.push(and(parts.map(not)))
			} else if (isFilters(value)) {
				throw new Error(`${model}.${key} takes a condition, not a list.`)
			} else {
				truths.push(this.condition(model, row, key, value))
			}
		}
		return and(truths)
	}

	private condition(
		model: string,
		row: StoredRow,
		name: string,
		condition: Condition,
	): Truth {
		if (condition.search !== undefined) {
			return searches(this.fields.get(model), row, condition.search)
		}
		const field = this.field(model, name)
		if (field === undefined || field.kind === 'scalar') {
			return scalar(row[name] ?? null, condition, (value) =>
				sortable(value, field),
			)
		}
		const rows = this.related(model, field, row)
		const test = (filter: Filter): Truth[] =>
			rows.map((other) => this.matches(field.target, other, filter))
		const truths: Truth[] = []
		if (condition.is !== undefined) {
			truths.push(
				condition.is === null
					? rows.length === 0
					: test(condition.is).includes(true),
			)
		}
		if (condition.isNot !== undefined) {
			truths.push(
				condition.isNot === null
					? rows.length > 0
					: !test(condition.isNot).includes(true),
			)
		}
		if (condition.some !== undefined) {
			truths.push(test(condition.some).includes(true))
		}
		if (condition.every !== undefined) {
			truths.push(!test(condition.every).includes(false))
		}
		if (condition.none !== undefined) {
			truths.push(!test(condition.none).includes(true))
		}
		if (condition.removedBy !== undefined) {
			// The key names a row an earlier delete of the write removed.
			const removed = this.removed.get(condition.removedBy)
			if (removed === undefined) throw new Error('No such delete.')
			const key = row[field.name]
			truths.push(typeof key === 'string' && removed.has(key))
		}
		return and(truths)
	}

	/** The row `through` reaches from `row`, and its model, if one (D-134). */
	reach(
		model: string,
		row: StoredRow,
		through: readonly Step[] = [],
	): { readonly model: string; readonly row: StoredRow } | undefined {
		let at: StoredRow | undefined = row
		let on = model
		for (const step of through) {
			const field = this.field(on, step.relation)
			if (field === undefined || field.kind === 'scalar') return undefined
			const [next] = this.related(on, field, at)
			at =
				next !== undefined &&
				this.matches(field.target, next, step.where) === true
					? next
					: undefined
			if (at === undefined) return undefined
			on = field.target
		}
		return { model: on, row: at }
	}

	/** A row's sort key: a field, through `one` relations, a count (D-134), a relevance (D-148). */
	private key(model: string, row: StoredRow, order: Order): unknown {
		if (order.relevance !== undefined) {
			return relevance(this.fields.get(model), row, order.relevance)
		}
		const reached = this.reach(model, row, order.through)
		if (reached === undefined) return null
		const { model: on, row: at } = reached
		if (order.count === undefined) {
			return sortable(at[order.field] ?? null, this.field(on, order.field))
		}
		return this.count(on, at, order.field, order.count)
	}

	/** The rows of a `many` relation of `row` that `where` selects. */
	private count(
		model: string,
		row: StoredRow,
		name: string,
		where: Filter,
	): number {
		const field = this.field(model, name)
		if (field === undefined || field.kind === 'scalar') return 0
		return this.related(model, field, row).filter(
			(other) => this.matches(field.target, other, where) === true,
		).length
	}

	/** Each row with its sort keys. */
	private keyed(
		model: string,
		rows: readonly StoredRow[],
		order: readonly Order[],
	) {
		return rows.map((row) => ({
			row,
			keys: order.map((each) => this.key(model, row, each)),
		}))
	}

	/** Filters, orders and pages rows of `model`, as `read` asks. */
	select(model: string, rows: StoredRow[], read: Nested): StoredRow[] {
		const order = read.orderBy ?? [{ field: 'id', direction: 'asc' }]
		const compare = (a: Keyed, b: Keyed) => compareKeys(a.keys, b.keys, order)
		const found = this.keyed(
			model,
			rows.filter((row) => this.matches(model, row, read.where) === true),
			order,
		).toSorted(compare)
		const skip = read.skip ?? 0
		const take = read.take
		if (take === 0) return []
		let start = 0
		let end = found.length
		if (read.cursor !== undefined) {
			const row = [...this.table(model).values()].find(
				(each) => this.matches(model, each, read.cursor) === true,
			)
			if (row === undefined) return []
			const [cursor] = this.keyed(model, [row], order)
			if (cursor === undefined) return []
			if (take === undefined || take > 0) {
				const index = found.findIndex((each) => compare(each, cursor) >= 0)
				start = index === -1 ? found.length : index
			} else {
				end = found.findLastIndex((each) => compare(each, cursor) <= 0)
				end += 1
			}
		}
		const sorted = found.map((each) => each.row)
		if (take === undefined || take > 0) {
			start += skip
			return sorted.slice(start, take === undefined ? end : start + take)
		}
		end -= skip
		return end <= 0 ? [] : sorted.slice(Math.max(start, end + take), end)
	}

	/** A row as the adapter returns it, with the relations `read` includes. */
	output(model: string, row: StoredRow, read: Nested): Row {
		const result: { id: string; [field: string]: unknown } = { id: row.id }
		const fields = read.fields === undefined ? undefined : new Set(read.fields)
		const reads = (name: string) => fields?.has(name) ?? true
		for (const [key, value] of Object.entries(row)) {
			const field = this.field(model, key)
			if (!reads(key)) continue
			if (field?.kind === 'one') {
				result[key] = typeof value === 'string' ? { id: value } : null
			} else {
				result[key] = copy(value)
			}
		}
		for (const field of this.fields.get(model)?.values() ?? []) {
			if (field.kind === 'one' && !field.stored && reads(field.name)) {
				const [other] = this.related(model, field, row)
				result[field.name] = other === undefined ? null : { id: other.id }
			}
		}
		for (const [name, nested] of Object.entries(read.include ?? {})) {
			const field = this.field(model, name)
			if (field === undefined || field.kind === 'scalar') continue
			const rows = this.related(model, field, row)
			if (field.kind === 'one') {
				const [other] = rows
				result[name] =
					other !== undefined &&
					this.matches(field.target, other, nested.where) === true
						? this.output(field.target, other, nested)
						: null
			} else {
				result[name] = this.select(field.target, rows, nested).map((other) =>
					this.output(field.target, other, nested),
				)
			}
		}
		const counts = Object.entries(read.count ?? {})
		if (counts.length > 0) {
			result['_count'] = Object.fromEntries(
				counts.map(([name, where]) => [
					name,
					this.count(model, row, name, where),
				]),
			)
		}
		return result
	}
}

type Keyed = { readonly row: StoredRow; readonly keys: readonly unknown[] }
