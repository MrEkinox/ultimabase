// A write at a level of a filter, judged by the level's own conditions
// (D-196): a row that fails them before and after the write makes no row
// above pass or fail, so it costs no read of the rows above.
import type { Condition, Filter, Row } from 'ultimabase'
import { inMemory, matches } from 'ultimabase/internal'
import type { Fields, ModelChanges } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import { stepOf } from './reach.ts'
import type { Level, Models } from './reach.ts'
import type { Loader } from './reads.ts'

const isList = (
	value: Condition | readonly Filter[],
): value is readonly Filter[] => Array.isArray(value)

/** The conditions on a relation's target id in `filter`, its own or its `AND`'s. */
function idsOf(filter: Filter): Filter[] {
	const { id, AND = [] } = filter
	const own = id === undefined || isList(id) ? [] : [{ id }]
	return [...own, ...AND.flatMap(idsOf)]
}

/**
 * What a row passing `where` passes too, which its stored fields answer:
 * `where` without its relations, but for a related id, which a stored key
 * holds; `undefined` when something else reads more than the row.
 */
export function loosened(
	models: Models,
	model: string,
	where: Filter,
): Filter | undefined {
	const parts: Filter[] = []
	for (const [key, value] of Object.entries(where)) {
		const part = { [key]: value }
		if (value === undefined || inMemory(model, part)) parts.push(part)
		else if (isList(value)) {
			if (key !== 'AND') return undefined
			for (const inner of value) {
				const loose = loosened(models, model, inner)
				if (loose === undefined) return undefined
				parts.push(loose)
			}
		} else if (stepOf(models, model, key) === undefined) return undefined
		else if (value.is) {
			const keys = idsOf(value.is).map((id) => ({ [key]: { is: id } }))
			parts.push(...keys.filter((condition) => inMemory(model, condition)))
		}
	}
	return { AND: parts }
}

/** Whether `where` may hold for `row` before an update that set `set`. */
export function held(
	model: string,
	row: Row,
	where: Filter,
	set: Fields,
): boolean {
	if (set === 'all') return true
	// A filter on a field the update left fails before as it does after.
	const left = Object.entries(where).filter(
		([key]) => key !== 'AND' && key !== 'OR' && key !== 'NOT' && !set.has(key),
	)
	const { AND = [] } = where
	return (
		matches(model, row, Object.fromEntries(left)) &&
		AND.every((part) => held(model, row, part, set))
	)
}

const looseLevels = new WeakMap<Level, Filter | null>()

/** `level`'s conditions loosened, but none under a negative level. */
function looseOf(models: Models, level: Level): Filter | undefined {
	let loose = looseLevels.get(level)
	if (loose === undefined) {
		loose = level.negative
			? null
			: (loosened(models, level.model, level.filter) ?? null)
		looseLevels.set(level, loose)
	}
	return loose ?? undefined
}

/** The fields `filter` reads on its rows. */
function readsOf(filter: Filter, into = new Set<string>()): Set<string> {
	for (const [key, value] of Object.entries(filter)) {
		if (value === undefined) continue
		if (isList(value)) for (const inner of value) readsOf(inner, into)
		else into.add(key)
	}
	return into
}

/**
 * The ids among `ids`, rows `changes` wrote at `level`, whose row may pass
 * the level's conditions before or after the write; each of them under a
 * negative level, or when the conditions read more than the row.
 */
export async function passing(
	models: Models,
	level: Level,
	changes: ModelChanges,
	ids: readonly string[],
	loader: Loader,
): Promise<readonly string[]> {
	const { model } = level
	const loose = ids.length === 0 ? undefined : looseOf(models, level)
	if (loose === undefined) return ids
	const deletes = new Set(listed(changes.deletes))
	const reads = readsOf(loose)
	const rows = await loader.load(
		model,
		ids.filter((id) => !deletes.has(id)),
	)
	const inserts = new Set(listed(changes.inserts))
	const set = changes.fields ?? 'all'
	return ids.filter((id) => {
		if (deletes.has(id)) {
			// A deleted row is gone: its id and keys are all it tells.
			const keys = changes.keys?.get(id)
			const known = new Set(['id', ...Object.keys(keys ?? {})])
			if (keys === undefined || [...reads].some((key) => !known.has(key))) {
				return true
			}
			return matches(model, { ...keys, id }, loose)
		}
		const row = rows.get(id)
		if (row === undefined) return true
		if (matches(model, row, loose)) return true
		return !inserts.has(id) && held(model, row, loose, set)
	})
}

/** Whether `changes` may make a row above `level` pass or fail. */
export async function reaches(
	models: Models,
	level: Level,
	changes: ModelChanges,
	loader: Loader,
): Promise<boolean> {
	if (unlisted(changes)) return true
	const updated = touched(changes, level.fields)
	const ids = [
		...listed(changes.inserts),
		...listed(changes.deletes),
		...(updated ? listed(changes.updates) : []),
	]
	return (await passing(models, level, changes, ids, loader)).length > 0
}
