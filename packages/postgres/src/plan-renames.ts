// The hint of a plan's removal that may be a rename (D-105): each added
// column or table alike may be its new name, and a hint never names one for
// two removals (D-232). A table's renames its keys and indexes too (D-251).
import type { Statement } from 'ultimabase'
import { addKeys, dropKeys } from './plan-keys.ts'
import type { Emit, Named } from './plan-parts.ts'
import { id, same } from './plan-parts.ts'
import type { TableSnapshot } from './snapshot.ts'

type Entry<T> = readonly [string, T]

type Hints = Map<string, Pick<Statement, 'rename'>>

function renames<T>(
	removed: readonly Entry<T>[],
	fresh: readonly Entry<T>[],
	alike: (was: T, now: T) => boolean,
	into: (from: Entry<T>, to: Entry<T>) => { name: string; sql: string[] },
): Hints {
	const found = removed.map(
		(entry) =>
			[entry, fresh.filter(([, now]) => alike(entry[1], now))] as const,
	)
	const takers = new Map<string, number>()
	for (const [, candidates] of found) {
		for (const [name] of candidates) {
			takers.set(name, (takers.get(name) ?? 0) + 1)
		}
	}
	// Nothing alike, or a lone one another removal may take too.
	const none = (candidates: readonly Entry<T>[]): boolean =>
		candidates.length < 2 &&
		candidates.every(([name]) => takers.get(name) !== 1)
	return new Map(
		found.map(([entry, candidates]) => [
			entry[0],
			none(candidates)
				? {}
				: {
						rename: {
							dbName: entry[0],
							to: candidates.map((to) => into(entry, to)),
						},
					},
		]),
	)
}

/** The entries of `to` that `from` lacks. */
const only = <T>(from: Named<T>, to: Named<T>): Entry<T>[] =>
	Object.entries(to).filter(([name]) => from[name] === undefined)

/**
 * Columns as a rename compares them: names, types and nullability, sorted,
 * because a stored snapshot's columns come back in jsonb's order.
 */
const shape = (table: TableSnapshot): unknown =>
	Object.entries(table.columns)
		.map(([name, { type, nullable }]) => [name, type, nullable])
		.toSorted(([a], [b]) => String(a).localeCompare(String(b)))

/** Each column of table `name` that `to` drops: an added one of its type. */
export const columnHints = (
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
): Hints =>
	renames(
		only(to.columns, from.columns),
		only(from.columns, to.columns),
		(was, now) => was.type === now.type,
		([key], [renamed, now]) => ({
			name: `${to.model}.${now.field}`,
			sql: [
				`alter table ${id(name)} rename column ${id(key)} to ${id(renamed)}`,
			],
		}),
	)

/**
 * Renames table `name` to `renamed`, which the lines a hint keeps give their
 * foreign keys and indexes: it drops the old keys, checks and indexes, each
 * named after the old table, and adds the keys and checks the create held.
 */
function renameTable(
	[name, was]: Entry<TableSnapshot>,
	[renamed, created]: Entry<TableSnapshot>,
): string[] {
	const sql = [`alter table ${id(name)} rename to ${id(renamed)}`]
	const emit: Emit = (statement) => {
		sql.push(statement)
	}
	const unindexed: TableSnapshot = {
		...created,
		indexes: {},
		trigrams: {},
		lowerUniques: {},
		partialUniques: {},
		search: null,
	}
	dropKeys(renamed, was, unindexed, emit)
	addKeys(renamed, [was, created], {}, emit)
	return sql
}

/** Each table `after` drops: an added one of the same columns. */
export const tableHints = (
	before: Named<TableSnapshot>,
	after: Named<TableSnapshot>,
): Hints =>
	renames(
		only(after, before),
		only(before, after),
		(was, now) => same(shape(was), shape(now)),
		(from, to) => ({ name: to[1].model, sql: renameTable(from, to) }),
	)
