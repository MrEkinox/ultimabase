// Whether a write may change what a recorded read found (D-154): a caller or
// a live read's plan that read it is built again.
import type { Recorded } from 'ultimabase/internal'
import { inMemory, liveSchema, matches } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import { modelsOf, stepOf, walk } from './reach.ts'
import type { Level } from './reach.ts'
import type { Loader } from './reads.ts'

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
	if (unlisted(changes) || ids === undefined) return true
	const found = new Set(ids)
	const written = [...listed(changes.updates), ...listed(changes.deletes)]
	if (written.some((id) => found.has(id))) return true
	const inserted = listed(changes.inserts)
	if (where === undefined) return inserted.length > 0
	const others = [...inserted, ...listed(changes.updates)]
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
