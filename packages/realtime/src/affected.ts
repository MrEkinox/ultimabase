// What a flush's changes do to one live read (D-154): the root rows to place
// again, the window rows deleted or to send again, or a resync when the feed
// does not say which rows changed.
import type { Batch } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import type { Reach, Step } from './reach.ts'

export type Affected = {
	/** Root rows whose membership or order may have changed. */
	readonly candidates: ReadonlySet<string>
	/** Window rows deleted. */
	readonly deleted: ReadonlySet<string>
	/** A row past the window may have left the list. */
	readonly beyond: boolean
	/** Window rows to read and send again. */
	readonly resend: ReadonlySet<string>
}

/**
 * The root rows that reach one of `ids` through `steps`, among `within` when
 * it is given.
 */
export type Finder = (
	steps: readonly Step[],
	ids: readonly string[],
	within?: readonly string[],
) => Promise<readonly string[]>

/** The window rows each row a shown relation reached is shown under. */
export type Tracked = ReadonlyMap<
	string,
	ReadonlyMap<string, ReadonlySet<string>>
>

export type Facing = {
	readonly model: string
	readonly reach: Reach
	readonly window: ReadonlySet<string>
	readonly tracked: Tracked
	readonly find: Finder
}

/** What `batch` does to the live read `facing` describes. */
export async function affected(
	facing: Facing,
	batch: Batch,
): Promise<Affected | 'resync'> {
	const { model, reach, window, find } = facing
	const root = batch.get(model)
	if (unlisted(root)) return 'resync'
	const candidates = new Set(listed(root?.inserts))
	const deleted = new Set<string>()
	let beyond = false
	for (const id of listed(root?.deletes)) {
		if (window.has(id)) deleted.add(id)
		else beyond = true
	}
	const updated = listed(root?.updates)
	if (touched(root, reach.placing)) {
		for (const id of updated) candidates.add(id)
	}
	const resend = new Set<string>()
	if (touched(root, reach.showing)) {
		for (const id of updated) if (window.has(id)) resend.add(id)
	}
	for (const level of reach.levels) {
		const changes = batch.get(level.model)
		const step = level.steps.at(-1)
		if (step === undefined || changes === undefined) continue
		if (unlisted(changes)) return 'resync'
		const ids = [
			...listed(changes.inserts),
			...(touched(changes, level.fields) ? listed(changes.updates) : []),
		]
		if (ids.length > 0) {
			for (const id of await find(level.steps, ids)) candidates.add(id)
		}
		// A link lost where it is stored: the rows that had it are unknown.
		const lost =
			changes.deletes !== undefined ||
			(step.keyOnTarget && touched(changes, new Set([step.inverse])))
		if (!lost) continue
		if (level.negative) return 'resync'
		for (const id of window) candidates.add(id)
	}
	const again = await shown(facing, batch)
	for (const id of again === 'all' ? window : again) resend.add(id)
	return { candidates, deleted, beyond, resend }
}

/** The window rows whose shown relations changed. */
async function shown(
	facing: Facing,
	batch: Batch,
): Promise<ReadonlySet<string> | 'all'> {
	const { reach, window, tracked, find } = facing
	for (const model of reach.deep) if (batch.has(model)) return 'all'
	const resend = new Set<string>()
	for (const relation of reach.shown) {
		const changes = batch.get(relation.model)
		if (changes === undefined) continue
		if (unlisted(changes)) return 'all'
		const updated = touched(changes, relation.fields)
			? listed(changes.updates)
			: []
		if (relation.counted && changes.deletes !== undefined) return 'all'
		const known = tracked.get(relation.path)
		for (const id of [...updated, ...listed(changes.deletes)]) {
			for (const root of known?.get(id) ?? []) resend.add(root)
		}
		const ids = [...listed(changes.inserts), ...updated]
		if (ids.length === 0 || window.size === 0) continue
		for (const id of await find(relation.steps, ids, [...window])) {
			resend.add(id)
		}
	}
	return resend
}
