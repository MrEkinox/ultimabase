// Whether a write may change what a recorded read found (D-154): a caller or
// a live read's plan that read it is built again.
import type { Filter } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import { inMemory, liveSchema, matches } from 'ultimabase/internal'
import type { Batch, Fields, ModelChanges } from './changes.ts'
import { listed, touched, wrote } from './changes.ts'
import { held, loosened, reaches } from './levels.ts'
import { facingOf, modelsOf, stepOf, stores, walk } from './reach.ts'
import type { Level, Models } from './reach.ts'
import type { Loader } from './loader.ts'

const fieldsOf = (fields: readonly string[] | undefined): Fields =>
	fields === undefined ? 'all' : new Set(fields)

/** What a recorded read is judged by, the same at every write. */
export type Judged = {
	/** The levels its relations reach. */
	readonly further: readonly Level[]
	/** The fields that chose its own rows, its relations' links aside. */
	readonly filters: Fields
	/** What its own rows alone answer; `null` when they cannot. */
	readonly where: Filter | undefined | null
	/** The links a relation read followed, as model and field. */
	readonly links: readonly (readonly [string, Fields])[]
	/** Every model it depends on: a write to any other can't change it. */
	readonly models: ReadonlySet<string>
}

/** The two sides of the relation a read followed, `model.field`. */
function linksOf(
	models: Models,
	relation: string | undefined,
): readonly (readonly [string, Fields])[] {
	if (relation === undefined) return []
	const [model = '', field = ''] = relation.split('.')
	const step = stepOf(models, model, field)
	const own = [model, new Set([field])] as const
	return step ? [own, [step.target, new Set(facingOf(step))]] : [own]
}

const judgedReads = new WeakMap<Recorded, Judged>()

export function judgedOf(models: Models, read: Recorded): Judged {
	const known = judgedReads.get(read)
	if (known !== undefined) return known
	const { model, where } = read
	const links = linksOf(models, read.relation)
	const linked = links.map(([name]) => name)
	let judged: Judged = {
		further: [],
		filters: fieldsOf(read.filters),
		where,
		links,
		models: new Set([model, ...linked]),
	}
	if (where !== undefined && !inMemory(model, where)) {
		const levels: Level[] = []
		walk(models, model, where, [], false, levels)
		const further = levels.filter(({ steps }) => steps.length > 0)
		// A link its relations follow is judged at the level it leads to.
		const through = new Set(further.map(({ steps }) => steps[0]?.relation))
		const { filters } = judged
		judged = {
			further,
			filters:
				filters === 'all'
					? filters
					: new Set(
							[...filters].filter(
								(name) => !through.has(name) || stores(models, model, name),
							),
						),
			// Its own rows are then checked against what they alone answer.
			where: loosened(models, model, where) ?? null,
			links,
			models: new Set([
				model,
				...linked,
				...further.map((level) => level.model),
			]),
		}
	}
	judgedReads.set(read, judged)
	return judged
}

/** Whether a write in `batch` may change what `read` found. */
async function stale(
	read: Recorded,
	batch: Batch,
	loader: Loader,
): Promise<boolean> {
	const models = modelsOf(liveSchema())
	const { further, filters, where, links } = judgedOf(models, read)
	for (const [linked, fields] of links) {
		if (touched(batch.get(linked), fields)) return true
	}
	const { model, ids } = read
	for (const level of further) {
		const changes = batch.get(level.model)
		if (changes && (await reaches(models, level, changes, loader))) {
			return true
		}
	}
	if (where === null) return batch.has(model)
	const changes = batch.get(model)
	if (changes === undefined) return false
	const { inserts, deletes } = changes
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

/** Whether `batch` wrote a model `read` depends on, which costs no wait. */
const mayChange = (read: Recorded, batch: Batch): boolean =>
	wrote(batch, judgedOf(modelsOf(liveSchema()), read).models)

/** Whether `batch` wrote a model one of `reads` depends on (D-255). */
export const mayBeStale = (reads: readonly Recorded[], batch: Batch): boolean =>
	reads.some((read) => mayChange(read, batch))

export const anyStale = async (
	reads: readonly Recorded[],
	batch: Batch,
	loader: Loader,
): Promise<boolean> => {
	for (const read of reads) {
		if (mayChange(read, batch) && (await stale(read, batch, loader)))
			return true
	}
	return false
}
