// The keys and checks of a table a plan drops and adds (D-105), around the
// columns' changes.
import { literal } from './fills.ts'
import { dropIndexes } from './plan-indexes.ts'
import type { Emit } from './plan-parts.ts'
import { added, changed, fields, id, keyOf, list, same } from './plan-parts.ts'
import type { Check, TableSnapshot } from './snapshot.ts'

/**
 * An enum's values, a list's elements among them with `<@` (D-127); or a
 * `within` relation's column, empty while its parent's is (D-235).
 */
export function checked(name: string, given: Check): string {
	const constraint = `constraint ${id(name)} check`
	if ('parent' in given) {
		return `${constraint} (${id(given.parent)} is not null or ${id(given.column)} is null)`
	}
	const items = given.values.map(literal).join(', ')
	const test = given.list ? `<@ array[${items}]::text[]` : `in (${items})`
	return `${constraint} (${id(given.column)} ${test})`
}

/** Drops the keys, checks and indexes of `from` that `to` changes. */
export function dropKeys(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	const drop = (key: string) =>
		`alter table ${id(name)} drop constraint ${id(key)}`
	if (!same(from.primaryKey, to.primaryKey)) {
		emit(drop(from.primaryKey.name), 'dropped the primary key')
	}
	for (const [key, columns] of changed(from.uniques, to.uniques)) {
		emit(drop(key), `dropped the unique key on ${fields(from, columns)}`)
	}
	for (const [key, given] of changed(from.checks, to.checks)) {
		const field = fields(from, [given.column])
		const does =
			'parent' in given
				? `dropped the check of ${field} on ${fields(from, [given.parent])}`
				: `dropped the values of ${field}`
		emit(drop(key), does)
	}
	dropIndexes(name, from, to, emit)
}

/** Adds the keys and checks of `to` that `from` lacks or changed. */
export function addKeys(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	const add = (part: string) => `alter table ${id(name)} add ${part}`
	if (!same(from.primaryKey, to.primaryKey)) {
		const { name: key, columns } = to.primaryKey
		emit(
			add(`constraint ${id(key)} primary key (${list(columns)})`),
			`keyed on ${fields(to, columns)}`,
			{
				tries: `keying ${keyOf(to, columns)} fails when two rows share a value`,
			},
		)
	}
	for (const [key, columns] of added(from.uniques, to.uniques)) {
		emit(
			add(`constraint ${id(key)} unique (${list(columns)})`),
			`added a unique key on ${fields(to, columns)}`,
			// A key holding the id, as a `within` key's (D-220), never fails.
			columns.includes('id')
				? {}
				: {
						tries: `a unique key on ${keyOf(to, columns)} fails when two rows share a value`,
					},
		)
	}
	for (const [key, given] of added(from.checks, to.checks)) {
		const field = fields(to, [given.column])
		if ('parent' in given) {
			const parent = fields(to, [given.parent])
			emit(add(checked(key, given)), `made ${field} need ${parent}`, {
				tries: `making "${to.model}.${field}" need ${parent} fails when a row holds one without it`,
			})
			continue
		}
		const values = given.values.join(', ')
		emit(add(checked(key, given)), `limited ${field} to ${values}`, {
			tries: `limiting "${to.model}.${field}" to ${values} fails when a row holds another value`,
		})
	}
}
