// How `memory()` aggregates (D-143), as PostgreSQL: a `null` is skipped, and
// a sum, an average, a minimum or a maximum of no value is `null`.
import type { Aggregate } from './adapter.ts'
import type { StoredRow } from './memory-read.ts'
import { compareValues, copy } from './memory-values.ts'

function of(
	values: readonly unknown[],
	operation: Aggregate['operation'],
): unknown {
	if (operation === 'count') return values.length
	const [head, ...rest] = values
	if (head === undefined) return null
	if (operation === 'min' || operation === 'max') {
		const sign = operation === 'min' ? 1 : -1
		const found = rest.reduce(
			(best, item) => (sign * compareValues(item, best) < 0 ? item : best),
			head,
		)
		return copy(found)
	}
	const sum = values.reduce((total: number, item) => total + Number(item), 0)
	return operation === 'sum' ? sum : sum / values.length
}

/** One value per aggregate of `rows`, in order. */
export function aggregated(
	rows: readonly StoredRow[],
	aggregates: readonly Aggregate[],
): unknown[] {
	return aggregates.map(({ operation, field }) => {
		if (field === undefined) return rows.length
		const values = rows.map((row) => row[field] ?? null)
		return of(
			values.filter((item) => item !== null),
			operation,
		)
	})
}
