// What a write concerns in the reads of one shape (D-256), row by row (D-258):
// each read sees only the rows that lead to its pins, so a flush costs the
// rows times the reads they reach rather than the rows times every read.
import type { Row } from 'ultimabase'
import type { Batch, Fields, ModelChanges } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import type { Held } from './needs.ts'
import { keyOf } from './needs.ts'
import type { Step } from './reach.ts'
import type { Loader } from './loader.ts'
import type { Shape } from './routes.ts'

/** Where each id leads. */
type Led = ReadonlyMap<string, readonly string[]>

/** Where `ids` lead, one step on; `undefined` past what one read holds. */
type Hop = (ids: readonly string[]) => Promise<Led | undefined>

type Pin = NonNullable<Shape['pin']>

const keysOf = (
	rows: ReadonlyMap<string, Row>,
	key: string,
): ReadonlyMap<string, readonly string[]> => {
	const led = new Map<string, readonly string[]>()
	for (const [id, row] of rows) {
		const found = keyOf(row, key)
		led.set(id, found === undefined ? [] : [found])
	}
	return led
}

const heldBy = (
	held: ReadonlyMap<string, Held | undefined>,
): Led | undefined => {
	const led = new Map<string, readonly string[]>()
	for (const [id, found] of held) {
		if (found === undefined) return undefined
		led.set(
			id,
			found.rows.map((row) => row.id),
		)
	}
	return led
}

/** From a row of `step`'s target to the `source` rows it hangs from. */
function backOf(source: string, step: Step, loader: Loader): Hop | undefined {
	const { target, relation, inverse, keyOnTarget, many } = step
	if (keyOnTarget && inverse !== undefined) {
		return async (ids) => keysOf(await loader.load(target, ids), inverse)
	}
	// A many-to-many link is stored out of sight.
	if (many) return undefined
	return async (ids) => heldBy(await loader.holding(source, relation, ids))
}

/** From a root row to the ids its pin requires of it. */
function forwardOf(root: string, { path, key }: Pin, loader: Loader): Hop[] {
	const hops: Hop[] = []
	let model = root
	for (const { target, relation, inverse, keyOnTarget } of path) {
		const source = model
		hops.push(
			keyOnTarget && inverse !== undefined
				? async (ids) => heldBy(await loader.holding(target, inverse, ids))
				: async (ids) => keysOf(await loader.load(source, ids), relation),
		)
		model = target
	}
	if (key !== 'id') {
		hops.push(async (ids) => keysOf(await loader.load(model, ids), key))
	}
	return hops
}

/** Where each of `ids` leads along `hops`. */
async function along(
	ids: readonly string[],
	hops: readonly Hop[],
): Promise<Led | undefined> {
	const led = new Map<string, readonly string[]>()
	for (const id of ids) led.set(id, [id])
	for (const hop of hops) {
		const next = new Set<string>()
		for (const at of led.values()) for (const id of at) next.add(id)
		const answer = await hop([...next])
		if (answer === undefined) return undefined
		for (const [id, at] of led) {
			led.set(
				id,
				at.flatMap((from) => answer.get(from) ?? []),
			)
		}
	}
	return led
}

/** The root rows each row of a route leads to; each of them, when no walk tells. */
async function rootsOf(
	root: string,
	steps: readonly Step[],
	ids: readonly string[],
	loader: Loader,
): Promise<Led | undefined> {
	if (steps.length === 0) return along(ids, [])
	const hops: Hop[] = []
	for (const [at, step] of steps.entries()) {
		const hop = backOf(steps[at - 1]?.target ?? root, step, loader)
		if (hop === undefined) break
		hops.unshift(hop)
	}
	const walked =
		hops.length === steps.length ? await along(ids, hops) : undefined
	if (walked !== undefined) {
		loader.lead(root, steps, walked)
		return walked
	}
	const found = await loader.reaching(root, steps, ids)
	return found && new Map(ids.map((id) => [id, found]))
}

/** The pins a root row deleted held, `'all'` when it does not say. */
function deletedPins(
	{ path, key }: Pin,
	id: string,
	changes: ModelChanges,
): readonly string[] | 'all' {
	if (path.length > 0) return 'all'
	if (key === 'id') return [id]
	const held = changes.keys?.get(id)?.[key]
	if (held === undefined) return 'all'
	return held === null ? [] : [held]
}

type Picked = {
	inserts?: Set<string>
	updates?: Set<string>
	deletes?: Set<string>
	fields?: Fields
	keys?: NonNullable<ModelChanges['keys']>
}

/** The rows that lead to each pin, by model. */
class Narrowed {
	readonly pins = new Map<string, Map<string, Picked>>()

	add(
		pin: string,
		model: string,
		changes: ModelChanges,
		kind: 'inserts' | 'updates' | 'deletes',
		id: string,
	): void {
		let models = this.pins.get(pin)
		if (models === undefined) {
			models = new Map()
			this.pins.set(pin, models)
		}
		let picked = models.get(model)
		if (picked === undefined) {
			const { fields, keys } = changes
			picked = { ...(fields && { fields }), ...(keys && { keys }) }
			models.set(model, picked)
		}
		const rows = picked[kind] ?? new Set()
		picked[kind] = rows.add(id)
	}
}

/** What a flush concerns in the reads of one shape. */
export type Concern = {
	/** The rows each pin can see. */
	readonly pins: ReadonlyMap<string, Batch>
	/**
	 * Root rows deleted with no pin they held, by id: each concerns the reads
	 * that hold it, or that cannot tell (D-314).
	 */
	readonly loose: ReadonlyMap<string, Batch>
}

/**
 * The rows of `batch` each pin of `shape` can see; `'all'` when no answer is
 * sure, which a read that fails also means to the caller.
 */
export async function concernOf(
	shape: Shape,
	batch: Batch,
	loader: Loader,
): Promise<Concern | 'all'> {
	const { root, pin, routes, links } = shape
	for (const [model, fields] of links) {
		const changes = batch.get(model)
		if (unlisted(changes) || touched(changes, fields)) return 'all'
	}
	const narrowed = new Narrowed()
	const loose = new Narrowed()
	const forward = pin && forwardOf(root, pin, loader)
	for (const { steps, model, fields } of routes) {
		const changes = batch.get(model)
		if (changes === undefined) continue
		if (unlisted(changes)) return 'all'
		const deletes = listed(changes.deletes)
		const inserts = listed(changes.inserts)
		const updates = touched(changes, fields) ? listed(changes.updates) : []
		if (pin === undefined || forward === undefined) {
			if (deletes.length + inserts.length + updates.length > 0) return 'all'
			continue
		}
		if (steps.length > 0 && deletes.length > 0) return 'all'
		for (const id of deletes) {
			const held = deletedPins(pin, id, changes)
			if (held === 'all') loose.add(id, model, changes, 'deletes', id)
			else
				for (const at of held) narrowed.add(at, model, changes, 'deletes', id)
		}
		const written = [...inserts, ...updates]
		if (written.length === 0) continue
		loader.expect(model, written)
		const roots = await rootsOf(root, steps, written, loader)
		if (roots === undefined) return 'all'
		const reached = new Set<string>()
		for (const at of roots.values()) for (const id of at) reached.add(id)
		loader.expect(root, reached)
		const pins = await along([...reached], forward)
		if (pins === undefined) return 'all'
		const pick = (rows: readonly string[], kind: 'inserts' | 'updates') => {
			for (const id of rows) {
				for (const from of roots.get(id) ?? []) {
					for (const at of pins.get(from) ?? []) {
						narrowed.add(at, model, changes, kind, id)
					}
				}
			}
		}
		pick(inserts, 'inserts')
		pick(updates, 'updates')
	}
	return { pins: narrowed.pins, loose: loose.pins }
}
