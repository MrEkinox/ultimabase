// How `memory()` aggregates (D-143), as PostgreSQL: a `null` is skipped, and
// a sum, an average, a minimum or a maximum of no value is `null`.
// A decimal's sum is exact, at its field's scale, its average that sum's
// number divided (D-145). Groups are kept by `having` as rows by a `where`
// (D-149), and sorted as a read's rows (D-146).
import type {
	Aggregate,
	AggregateRead,
	Filter,
	GroupKey,
	Read,
	SchemaField,
} from './adapter.ts'
import { sumDecimals } from './decimal.ts'
import type { Truth } from './memory-conditions.ts'
import { and, isFilters, not, or, scalar } from './memory-conditions.ts'
import type { Reader, StoredRow } from './memory-read.ts'
import { compareKeys, compareValues, copy, sortable } from './memory-values.ts'

function of(
	values: readonly unknown[],
	operation: Aggregate['operation'],
	field: SchemaField | undefined,
): unknown {
	if (operation === 'count') return values.length
	const [head, ...rest] = values
	if (head === undefined) return null
	if (operation === 'min' || operation === 'max') {
		const sign = operation === 'min' ? 1 : -1
		const order = (a: unknown, b: unknown) =>
			compareValues(sortable(a, field), sortable(b, field))
		const found = rest.reduce(
			(best, item) => (sign * order(item, best) < 0 ? item : best),
			head,
		)
		return copy(found)
	}
	const sum =
		field?.kind === 'scalar' && field.type === 'decimal'
			? sumDecimals(values.map(String), field.scale ?? 0)
			: values.reduce((total: number, item) => total + Number(item), 0)
	return operation === 'sum' ? sum : Number(sum) / values.length
}

/** One value per aggregate of `rows`, in order. */
function aggregated(
	rows: readonly StoredRow[],
	aggregates: readonly Aggregate[],
	fieldOf: (name: string) => SchemaField | undefined,
): unknown[] {
	return aggregates.map(({ operation, field }) => {
		if (field === undefined) return rows.length
		const values = rows.map((row) => row[field] ?? null)
		return of(
			values.filter((item) => item !== null),
			operation,
			fieldOf(field),
		)
	})
}

/** The values of a row's keys, a key through a relation its target's. */
function keysOf(
	reader: Reader,
	model: string,
	row: StoredRow,
	by: readonly GroupKey[],
): unknown[] {
	return by.map(({ field, through }) => {
		const reached = reader.reach(model, row, through)
		return copy(reached?.row[field] ?? null)
	})
}

/** Of the rows with the same keys, the first in `read`'s order (D-147). */
export function distinct(
	reader: Reader,
	read: Read,
	rows: StoredRow[],
): StoredRow[] {
	const { where, orderBy } = read
	const sorted = reader.select(read.model, rows, {
		...(where && { where }),
		...(orderBy && { orderBy }),
	})
	const seen = new Set<string>()
	return sorted.filter((row) => {
		const id = JSON.stringify(
			keysOf(reader, read.model, row, read.distinct ?? []),
		)
		if (seen.has(id)) return false
		seen.add(id)
		return true
	})
}

/** Whether a group's values pass `having`, whose keys are positions (D-149). */
function held(
	filter: Filter,
	values: readonly unknown[],
	fields: readonly (SchemaField | undefined)[],
): Truth {
	const truths: Truth[] = []
	for (const [key, part] of Object.entries(filter)) {
		if (part === undefined) continue
		if (!isFilters(part)) {
			const at = Number(key)
			const sorted = (value: unknown) => sortable(value, fields[at])
			truths.push(scalar(values[at] ?? null, part, sorted))
			continue
		}
		const inner = part.map((each) => held(each, values, fields))
		if (key === 'AND') truths.push(and(inner))
		else if (key === 'OR') truths.push(or(inner))
		else truths.push(and(inner.map((truth) => not(truth))))
	}
	return and(truths)
}

/** Each group of `rows`: its keys' values, then its aggregates', in order. */
export function grouped(
	reader: Reader,
	read: AggregateRead,
	rows: readonly StoredRow[],
): unknown[][] {
	const by = read.by ?? []
	const fieldOf = (name: string) => reader.field(read.model, name)
	const groups = new Map<string, { keys: unknown[]; rows: StoredRow[] }>()
	if (by.length === 0) groups.set('[]', { keys: [], rows: [] })
	for (const row of rows) {
		const keys = keysOf(reader, read.model, row, by)
		const id = JSON.stringify(keys)
		const group = groups.get(id) ?? { keys, rows: [] }
		group.rows.push(row)
		groups.set(id, group)
	}
	const lists = [...groups.values()].map((group) => [
		...group.keys,
		...aggregated(group.rows, read.aggregates, fieldOf),
	])
	// A key through a relation is an id; a decimal sorts by value (D-145).
	const fields = [
		...by.map(({ field, through }) => (through ? undefined : field)),
		...read.aggregates.map(({ operation, field }) =>
			operation === 'count' ? undefined : field,
		),
	].map((name) => (name === undefined ? undefined : fieldOf(name)))
	const { having } = read
	const kept =
		having === undefined
			? lists
			: lists.filter((list) => held(having, list, fields) === true)
	const order = read.orderBy ?? []
	const sorted = (list: readonly unknown[]) =>
		order.map(({ at }) => sortable(list[at], fields[at]))
	kept.sort((a, b) => compareKeys(sorted(a), sorted(b), order))
	const skip = read.skip ?? 0
	return kept.slice(
		skip,
		read.take === undefined ? undefined : skip + read.take,
	)
}
