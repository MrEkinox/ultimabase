// How `memory()` reads: filters with SQL's three-valued logic, so that a
// `null` compares as PostgreSQL would, then order, cursor and page.
import type {
	Condition,
	Filter,
	Nested,
	Order,
	Row,
	SchemaField,
} from './adapter.ts'
import { compareKeys, compareValues, copy, same } from './memory-values.ts'

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

/** Each model's fields by name. */
export type Fields = ReadonlyMap<string, ReadonlyMap<string, SchemaField>>

type Truth = boolean | null

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
		const table = this.store.tables.get(model)
		if (table === undefined) throw new Error(`Unknown model ${model}.`)
		return table
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
		const field = this.field(model, name)
		if (field === undefined || field.kind === 'scalar') {
			return scalar(row[name] ?? null, condition)
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

	/** A row's sort key: a field, through `one` relations, or a count (D-134). */
	private key(model: string, row: StoredRow, order: Order): unknown {
		let at: StoredRow | undefined = row
		let on = model
		for (const step of order.through ?? []) {
			const field = this.field(on, step.relation)
			if (field === undefined || field.kind === 'scalar') return null
			const [next] = this.related(on, field, at)
			at =
				next !== undefined &&
				this.matches(field.target, next, step.where) === true
					? next
					: undefined
			if (at === undefined) return null
			on = field.target
		}
		if (order.count === undefined) return at[order.field] ?? null
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
		for (const [key, value] of Object.entries(row)) {
			const field = this.field(model, key)
			if (field?.kind === 'one') {
				result[key] = typeof value === 'string' ? { id: value } : null
			} else {
				result[key] = copy(value)
			}
		}
		for (const field of this.fields.get(model)?.values() ?? []) {
			if (field.kind === 'one' && !field.stored) {
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

function and(truths: readonly Truth[]): Truth {
	if (truths.includes(false)) return false
	return truths.includes(null) ? null : true
}

function or(truths: readonly Truth[]): Truth {
	if (truths.includes(true)) return true
	return truths.includes(null) ? null : false
}

function not(truth: Truth): Truth {
	return truth === null ? null : !truth
}

function isFilters(
	value: Condition | readonly Filter[],
): value is readonly Filter[] {
	return Array.isArray(value)
}

/** A text operator; the `where` check lets only strings reach it. */
function text(
	value: unknown,
	operand: unknown,
	test: (value: string, operand: string) => boolean,
): boolean {
	return (
		typeof value === 'string' &&
		typeof operand === 'string' &&
		test(value, operand)
	)
}

function scalar(value: unknown, condition: Condition): Truth {
	const truths: Truth[] = []
	const known = value !== null
	for (const [operator, operand] of Object.entries(condition)) {
		if (operand === undefined) continue
		if (operator === 'equals' || operator === 'not') {
			const equal =
				operand === null ? !known : known ? same(value, operand) : null
			truths.push(operator === 'equals' ? equal : not(equal))
		} else if (operator === 'in' || operator === 'notIn') {
			const list: readonly unknown[] = Array.isArray(operand) ? operand : []
			const found =
				list.length === 0
					? false
					: known
						? list.some((item) => same(value, item))
						: null
			truths.push(operator === 'in' ? found : not(found))
		} else if (!known) {
			truths.push(null)
		} else if (operator === 'has' || operator === 'hasSome') {
			const items: readonly unknown[] = Array.isArray(value) ? value : []
			const wanted: readonly unknown[] = Array.isArray(operand)
				? operand
				: [operand]
			truths.push(wanted.some((item) => items.includes(item)))
		} else if (operator === 'contains') {
			truths.push(text(value, operand, (a, b) => a.includes(b)))
		} else if (operator === 'startsWith') {
			truths.push(text(value, operand, (a, b) => a.startsWith(b)))
		} else if (operator === 'endsWith') {
			truths.push(text(value, operand, (a, b) => a.endsWith(b)))
		} else {
			const order = compareValues(value, operand)
			if (operator === 'lt') truths.push(order < 0)
			else if (operator === 'lte') truths.push(order <= 0)
			else if (operator === 'gt') truths.push(order > 0)
			else truths.push(order >= 0)
		}
	}
	return and(truths)
}

type Keyed = { readonly row: StoredRow; readonly keys: readonly unknown[] }
