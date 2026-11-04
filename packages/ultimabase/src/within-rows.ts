// The rows a write knows, as they end, for the checks of the relations kept
// within a parent (D-220, D-236): the rows it inserts, and those it updates by
// id from the row it read.
import type { Change, Filter } from './adapter.ts'
import type { Event } from './hooks.ts'
import { isObject } from './query-values.ts'

export type Known = {
	readonly values: { [field: string]: unknown }
	/** Inserted by the write. */
	readonly fresh: boolean
	/** The fields its updates set. */
	readonly wrote: Set<string>
}

/** A stored `one` key: an id in a change, `{ id }` in a row read. */
export function keyOf(value: unknown): string | null {
	if (typeof value === 'string') return value
	return isObject(value) && typeof value['id'] === 'string' ? value['id'] : null
}

/** The ids a change's `where` names alone, or none when it filters more. */
export function idsOf(where: Filter): readonly string[] {
	const { id, ...others } = where
	if (Object.keys(others).length > 0 || !isObject(id)) return []
	const ids: unknown[] = [id['equals'], id['in']].flat()
	return ids.filter((each) => typeof each === 'string')
}

type Update = Extract<Change, { kind: 'update' }>

/** The rows by model and id, the updates that read none, the ids deleted. */
export type Ended = {
	readonly rows: Map<string, Map<string, Known>>
	readonly blind: readonly Update[]
	readonly gone: ReadonlySet<string>
}

/** The rows the write knows, by model and id, as they are once it ran. */
export function knownRows(
	changes: readonly Change[],
	events: readonly Event[],
): Ended {
	const rows = new Map<string, Map<string, Known>>()
	const of = (model: string) => {
		const known = rows.get(model) ?? new Map<string, Known>()
		rows.set(model, known)
		return known
	}
	for (const event of events) {
		if (event.operation === 'create') continue
		const values = { ...event.before }
		of(event.model.name).set(event.id, {
			values,
			fresh: false,
			wrote: new Set(),
		})
	}
	const blind: Update[] = []
	const gone = new Set<string>()
	for (const change of changes) {
		if (change.kind === 'insert') {
			const values = { ...change.row }
			of(change.model).set(change.row.id, {
				values,
				fresh: true,
				wrote: new Set(),
			})
		} else if (change.kind === 'delete') {
			for (const id of idsOf(change.where)) gone.add(id)
		} else if (change.kind === 'update') {
			const ids = idsOf(change.where)
			const known = ids.flatMap((id) => of(change.model).get(id) ?? [])
			if (ids.length === 0 || known.length < ids.length) {
				blind.push(change)
				continue
			}
			for (const row of known) {
				Object.assign(row.values, change.set)
				for (const name of Object.keys(change.set)) row.wrote.add(name)
			}
		}
	}
	for (const id of gone) for (const each of rows.values()) each.delete(id)
	return { rows, blind, gone }
}
