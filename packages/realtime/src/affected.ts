// What a flush's changes do to one live read (D-154): the root rows to place
// again, the window rows deleted or to send again, or a resync when the feed
// does not say which rows changed.
import type { Batch, ModelChanges } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import type { Deep, Level, Reach, Shown, Step } from './reach.ts'
import { facingOf } from './reach.ts'

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
	within?: Ids,
) => Promise<readonly string[]>

/** The window's ids, a set or a map by id. */
export type Ids = {
	readonly size: number
	has: (id: string) => boolean
	keys: () => Iterable<string>
}

/**
 * The ids among `ids`, rows `changes` wrote at `level`, that may make a
 * row above pass or fail (D-196).
 */
export type Judge = (
	level: Level,
	changes: ModelChanges,
	ids: readonly string[],
) => Promise<readonly string[]>

export type Facing = {
	readonly model: string
	readonly reach: Reach
	readonly window: Ids
	readonly find: Finder
	readonly judge: Judge
}

/** What `batch` does to the live read `facing` describes. */
export async function affected(
	facing: Facing,
	batch: Batch,
): Promise<Affected | 'resync'> {
	const { model, reach, window, find, judge } = facing
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
		const rewritten = listed(changes.updates)
		const written = [
			...listed(changes.inserts),
			...(touched(changes, level.fields) ? rewritten : []),
		]
		const ids = written.length > 0 ? await judge(level, changes, written) : []
		if (ids.length > 0) {
			for (const id of await find(level.steps, ids)) candidates.add(id)
		}
		// A link lost where it is stored: the rows that had it are unknown.
		const moved = step.keyOnTarget && touched(changes, new Set(facingOf(step)))
		const gone = [...listed(changes.deletes), ...(moved ? rewritten : [])]
		if (gone.length === 0) continue
		if (level.negative) return 'resync'
		if ((await judge(level, changes, gone)).length === 0) continue
		for (const id of window.keys()) candidates.add(id)
	}
	const again = await shown(facing, batch)
	for (const id of again === 'all' ? window.keys() : again) resend.add(id)
	return { candidates, deleted, beyond, resend }
}

/**
 * The window rows a write at a level of a shown relation's filter or order
 * may change (D-252): judged by the level's own conditions as a filter's
 * levels are (D-196). A row a stored key leads to is new to every row: the
 * row that would link it is written too, at its own level.
 */
async function below(
	{ window, find, judge }: Facing,
	{ level, path, parent }: Deep,
	batch: Batch,
): Promise<readonly string[] | 'all'> {
	const changes = batch.get(level.model)
	const step = level.steps.at(-1)
	if (step === undefined || changes === undefined) return []
	if (unlisted(changes)) return 'all'
	const linked = step.many || step.keyOnTarget
	const rewritten = listed(changes.updates)
	// A link lost: the rows that had it are unknown.
	const moved = linked && touched(changes, new Set(facingOf(step)))
	const gone = [
		...(parent ? [] : listed(changes.deletes)),
		...(moved ? rewritten : []),
	]
	if ((await judge(level, changes, gone)).length > 0) return 'all'
	const written = [
		...(linked ? listed(changes.inserts) : []),
		...(touched(changes, level.fields) ? rewritten : []),
	]
	const ids = await judge(level, changes, written)
	return ids.length === 0 || window.size === 0 ? [] : find(path, ids, window)
}

/**
 * The window rows that lost a row of `relation` (D-252). A deleted row with
 * the key on its side names its parent. A row a stored key names is written
 * with the row that named it, emptied or deleted. A many-to-many link goes
 * unlisted, and a key that moved does not say where from.
 */
async function losing(
	{ window, find }: Facing,
	{ steps }: Shown,
	changes: ModelChanges,
): Promise<readonly string[] | 'all'> {
	const step = steps.at(-1)
	const deletes = listed(changes.deletes)
	if (step === undefined) return []
	if (!step.keyOnTarget) return step.many && deletes.length > 0 ? 'all' : []
	if (touched(changes, new Set(facingOf(step)))) return 'all'
	const parents = new Set<string>()
	for (const id of deletes) {
		const parent = changes.keys?.get(id)?.[step.inverse ?? '']
		if (parent === undefined) return 'all'
		if (parent !== null) parents.add(parent)
	}
	const above = steps.slice(0, -1)
	if (above.length > 0) {
		return parents.size === 0 ? [] : find(above, [...parents], window)
	}
	return [...parents].filter((id) => window.has(id))
}

/** The window rows whose shown relations changed. */
async function shown(
	facing: Facing,
	batch: Batch,
): Promise<ReadonlySet<string> | 'all'> {
	const { reach, window, find } = facing
	const resend = new Set<string>()
	for (const deep of reach.deep) {
		const again = await below(facing, deep, batch)
		if (again === 'all') return 'all'
		for (const id of again) resend.add(id)
	}
	for (const relation of reach.shown) {
		const changes = batch.get(relation.model)
		if (changes === undefined) continue
		if (unlisted(changes)) return 'all'
		const lost = await losing(facing, relation, changes)
		if (lost === 'all') return 'all'
		for (const id of lost) resend.add(id)
		const ids = [
			...listed(changes.inserts),
			...(touched(changes, relation.fields) ? listed(changes.updates) : []),
		]
		if (ids.length === 0 || window.size === 0) continue
		for (const id of await find(relation.steps, ids, window)) resend.add(id)
	}
	return resend
}
