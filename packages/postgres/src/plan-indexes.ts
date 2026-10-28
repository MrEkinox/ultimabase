// The indexes a plan drops and creates: B-tree, GIN on a list (D-120),
// trigram for `contains` (D-141), and the `_search` column with its GIN
// index (D-148).
import { literal } from './fills.ts'
import type { Emit, Named } from './plan-parts.ts'
import { added, changed, fields, id, list, same } from './plan-parts.ts'
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
	name: string,
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
	// A generated column holds nothing of its own: a change makes it again.
	if (from.search !== null && !same(from.search, to.search)) {
		emit(
			`alter table ${id(name)} drop column "_search"`,
			`dropped the search on ${fields(from, from.search.columns)}`,
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
	const { search } = table
	if (search === null || (was !== undefined && same(was.search, search))) {
		return
	}
	const text = search.columns
		.map((column) => `coalesce(${id(column)}, '')`)
		.join(` || ' ' || `)
	const searched = fields(table, search.columns)
	emit(
		`alter table ${id(name)} add column "_search" tsvector generated always as (to_tsvector(${literal(search.language)}::regconfig, ${text})) stored`,
		`added the search on ${searched}`,
	)
	emit(
		`create index ${id(search.index)} on ${id(name)} using gin ("_search")`,
		`indexed the search on ${searched}`,
	)
}
