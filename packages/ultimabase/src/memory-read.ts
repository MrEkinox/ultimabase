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
import { isObject } from './query-where.ts'

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

	/** Filters, orders and pages rows of `model`, as `read` asks. */
	select(model: string, rows: StoredRow[], read: Nested): StoredRow[] {
		const found = rows.filter(
			(row) => this.matches(model, row, read.where) === true,
		)
		const order = read.orderBy ?? [{ field: 'id', direction: 'asc' }]
		found.sort((a, b) => compareRows(a, b, order))
		const skip = read.skip ?? 0
		const take = read.take
		if (take === 0) return []
		let start = 0
		let end = found.length
		if (read.cursor !== undefined) {
			const cursor = [...this.table(model).values()].find(
				(row) => this.matches(model, row, read.cursor) === true,
			)
			if (cursor === undefined) return []
			if (take === undefined || take > 0) {
				const index = found.findIndex(
					(row) => compareRows(row, cursor, order) >= 0,
				)
				start = index === -1 ? found.length : index
			} else {
				end = found.findLastIndex((row) => compareRows(row, cursor, order) <= 0)
				end += 1
			}
		}
		if (take === undefined || take > 0) {
			start += skip
			return found.slice(start, take === undefined ? end : start + take)
		}
		end -= skip
		return end <= 0 ? [] : found.slice(Math.max(start, end + take), end)
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

/** Equality as PostgreSQL's: `-0` is `0`, json keys come in any order. */
export function same(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
	if (Array.isArray(a) && Array.isArray(b))
		return (
			a.length === b.length && a.every((item, index) => same(item, b[index]))
		)
	if (isObject(a) && isObject(b)) {
		const keys = Object.keys(a)
		return (
			keys.length === Object.keys(b).length &&
			keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
		)
	}
	return a === b
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

/** A surrogate sorts above U+FFFF, as the code point it is part of. */
const weight = (unit: number): number => {
	if (unit >= 0xd8_00 && unit <= 0xdf_ff) return unit + 0x20_00
	return unit >= 0xe0_00 ? unit - 0x8_00 : unit
}

/**
 * Strings compare by code point, as PostgreSQL's `C` collation (D-94);
 * dates, numbers and booleans by their number. Json values are not sorted.
 */
function compareValues(a: unknown, b: unknown): number {
	if (typeof a === 'string' && typeof b === 'string') {
		for (let index = 0; index < Math.min(a.length, b.length); index++) {
			const order = weight(a.charCodeAt(index)) - weight(b.charCodeAt(index))
			if (order !== 0) return order
		}
		return a.length - b.length
	}
	return Number(a) - Number(b)
}

/** `null` sorts last ascending and first descending, as in PostgreSQL. */
export function compareRows(
	a: StoredRow,
	b: StoredRow,
	order: readonly Order[],
): number {
	for (const { field, direction } of order) {
		const left = a[field] ?? null
		const right = b[field] ?? null
		let result = 0
		if (left === null || right === null) {
			result = left === right ? 0 : left === null ? 1 : -1
		} else {
			result = compareValues(left, right)
		}
		if (result !== 0) return direction === 'asc' ? result : -result
	}
	return 0
}

/** A stored value the caller may change without changing the store. */
export function copy(value: unknown): unknown {
	if (value instanceof Date) return new Date(value.getTime())
	return typeof value === 'object' && value !== null
		? structuredClone(value)
		: value
}
