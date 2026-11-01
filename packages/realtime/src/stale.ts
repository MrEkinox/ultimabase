// Whether a write may change what a recorded read found (D-154): a caller or
// a live read's plan that read it is built again.
import type { Condition, Filter, Row } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import { inMemory, liveSchema, matches } from 'ultimabase/internal'
import type { Batch, Fields, ModelChanges } from './changes.ts'
import { listed, touched } from './changes.ts'
import { modelsOf, stepOf, walk } from './reach.ts'
import type { Level, Models } from './reach.ts'
import type { Loader } from './reads.ts'

const fieldsOf = (fields: readonly string[] | undefined): Fields =>
	fields === undefined ? 'all' : new Set(fields)

/** Whether a write in `batch` may change what `read` found. */
async function stale(
	read: Recorded,
	batch: Batch,
	loader: Loader,
): Promise<boolean> {
	const models = modelsOf(liveSchema())
	if (read.relation !== undefined) {
		const [model = '', field = ''] = read.relation.split('.')
		const step = stepOf(models, model, field)
		if (touched(batch.get(model), new Set([field]))) return true
		if (step && touched(batch.get(step.target), new Set([step.inverse]))) {
			return true
		}
	}
	const { model, ids } = read
	let { where } = read
	if (where !== undefined && !inMemory(model, where)) {
		const levels: Level[] = []
		walk(models, model, where, [], false, levels)
		const further = levels.filter(({ steps }) => steps.length > 0)
		if (further.some((level) => batch.has(level.model))) return true
		// Its own rows are then checked against what they alone answer.
		const loose = loosened(models, model, where)
		if (loose === undefined) return batch.has(model)
		where = loose
	}
	const changes = batch.get(model)
	if (changes === undefined) return false
	const { inserts, deletes } = changes
	const filters = fieldsOf(read.filters)
	const any =
		read.fields === undefined || filters === 'all'
			? 'all'
			: new Set([...read.fields, ...filters])
	// An update that sets no field it returned or chose its rows by is none.
	const updates = touched(changes, any) ? changes.updates : undefined
	if (inserts === 'all' || deletes === 'all' || updates === 'all') return true
	if (ids === undefined) return counted(model, where, changes, updates, loader)
	const found = new Set(ids)
	const written = [...listed(updates), ...listed(deletes)]
	if (written.some((id) => found.has(id))) return true
	// A row enters when inserted, or updated in a field that chose the rows.
	const moved = touched(changes, filters) ? listed(updates) : []
	const others = [...listed(inserts), ...moved]
	if (others.length === 0) return false
	if (where === undefined) return true
	const rows = await loader.load(model, others)
	return [...rows.values()].some((row) => matches(model, row, where))
}

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
function loosened(
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
function held(model: string, row: Row, where: Filter, set: Fields): boolean {
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

/**
 * Whether a write may change what a read without ids found, a count: a
 * row inserted into its `where`, deleted, or updated in or out of it.
 */
async function counted(
	model: string,
	where: Filter | undefined,
	changes: ModelChanges,
	updates: ReadonlySet<string> | undefined,
	loader: Loader,
): Promise<boolean> {
	const inserts = listed(changes.inserts)
	const inserted = new Set(inserts)
	const updated = listed(updates)
	if (listed(changes.deletes).length > 0) return true
	if (inserts.length + updated.length === 0) return false
	if (where === undefined) return true
	const rows = await loader.load(model, [...inserts, ...updated])
	const set = changes.fields ?? 'all'
	return [...rows.values()].some((row) =>
		inserted.has(row.id)
			? matches(model, row, where)
			: held(model, row, where, set),
	)
}

export const anyStale = async (
	reads: readonly Recorded[],
	batch: Batch,
	loader: Loader,
): Promise<boolean> => {
	for (const read of reads) if (await stale(read, batch, loader)) return true
	return false
}
