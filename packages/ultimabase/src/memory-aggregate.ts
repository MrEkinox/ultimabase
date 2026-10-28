// How `memory()` aggregates (D-143), as PostgreSQL: a `null` is skipped, and
// a sum, an average, a minimum or a maximum of no value is `null`.
// A decimal's sum is exact, at its field's scale, its average that sum's
// number divided (D-145).
import type { Aggregate, SchemaField } from './adapter.ts'
import { sumDecimals } from './decimal.ts'
import type { StoredRow } from './memory-read.ts'
import { compareValues, copy, sortable } from './memory-values.ts'

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
export function aggregated(
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
