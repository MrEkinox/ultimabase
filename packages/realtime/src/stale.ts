// Whether a write may change what a recorded read found (D-154): a caller or
// a live read's plan that read it is built again.
import type { Recorded } from 'ultimabase/internal'
import { inMemory, liveSchema, matches } from 'ultimabase/internal'
import type { Batch, Fields } from './changes.ts'
import { listed, touched } from './changes.ts'
import { modelsOf, stepOf, walk } from './reach.ts'
import type { Level } from './reach.ts'
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
	const { model, where, ids } = read
	if (where !== undefined && !inMemory(model, where)) {
		const levels: Level[] = []
		walk(models, model, where, [], false, levels)
		return levels.some((level) => batch.has(level.model))
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
	if (ids === undefined || inserts === 'all' || deletes === 'all') {
		return (inserts ?? deletes ?? updates) !== undefined
	}
	if (updates === 'all') return true
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

export const anyStale = async (
	reads: readonly Recorded[],
	batch: Batch,
	loader: Loader,
): Promise<boolean> => {
	for (const read of reads) if (await stale(read, batch, loader)) return true
	return false
}
