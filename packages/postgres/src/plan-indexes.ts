// The indexes a plan drops and creates: B-tree, GIN on a list (D-120), and
// trigram for `contains` (D-141).
import type { Emit, Named } from './plan-parts.ts'
import { added, changed, fields, id, list } from './plan-parts.ts'
import type { TableSnapshot } from './snapshot.ts'

/** An index, by GIN on a list (D-120, D-127): its column's type decides. */
type Index = { readonly columns: string[]; readonly gin: boolean }

const indexesOf = (table: TableSnapshot | undefined): Named<Index> =>
	Object.fromEntries(
		Object.entries(table?.indexes ?? {}).map(([key, columns]) => [
			key,
			{
				columns,
				gin: columns.some(
					(name) => table?.columns[name]?.type.endsWith('[]') === true,
				),
			},
		]),
	)

/** Drops the indexes of `from` that `to` changes. */
export function dropIndexes(
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	for (const [key, { columns }] of changed(indexesOf(from), indexesOf(to))) {
		emit(
			`drop index ${id(key)}`,
			`dropped the index on ${fields(from, columns)}`,
		)
	}
	for (const [key, column] of changed(from.trigrams, to.trigrams)) {
		emit(
			`drop index ${id(key)}`,
			`dropped the contains index on ${fields(from, [column])}`,
		)
	}
}

/** Whether `to` adds a trigram index `from` lacks. */
export const addsTrigrams = (
	from: TableSnapshot | undefined,
	to: TableSnapshot,
): boolean => added(from?.trigrams ?? {}, to.trigrams).length > 0

/**
 * Creates the indexes `table` adds to `was`. A trigram index reads the
 * column under the database's collation, as `contains` does (D-141).
 */
export function addIndexes(
	name: string,
	was: TableSnapshot | undefined,
	table: TableSnapshot,
	emit: Emit,
): void {
	for (const [key, { columns, gin }] of added(
		indexesOf(was),
		indexesOf(table),
	)) {
		emit(
			`create index ${id(key)} on ${id(name)}${gin ? ' using gin' : ''} (${list(columns)})`,
			`indexed ${fields(table, columns)}`,
		)
	}
	for (const [key, column] of added(was?.trigrams ?? {}, table.trigrams)) {
		emit(
			`create index ${id(key)} on ${id(name)} using gin ((${id(column)} collate "default") gin_trgm_ops)`,
			`indexed ${fields(table, [column])} for contains`,
		)
	}
}
