// What a write can concern in a live read (D-256): the routes from the models
// it reaches back to its root, and the ids its filter requires of every row.
import type { Condition, Filter } from 'ultimabase'
import type { LivePlan, Recorded } from 'ultimabase/internal'
import type { Batch, Fields, ModelChanges } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import { keyOf, required } from './needs.ts'
import type { Models, Reach, Step } from './reach.ts'
import { isList, stepOf, stores, union } from './reach.ts'
import type { Loader } from './reads.ts'
import { judgedOf } from './stale.ts'

/** The ids a read's rows must lead to, along `path`, by `key` there. */
export type Pin = {
	readonly path: readonly Step[]
	/** `id`, or a key the rows `path` leads to store. */
	readonly key: string
	readonly ids: readonly string[]
}

/** Rows of `model`, `steps` from the root, whose `fields` the read depends on. */
export type Route = {
	readonly steps: readonly Step[]
	readonly model: string
	readonly fields: Fields
}

export type Interest = {
	readonly root: string
	readonly pin: Pin | undefined
	readonly routes: readonly Route[]
}

/** What the reads of one shape share: their interest but for the pin's ids. */
export type Shape = {
	readonly key: string
	readonly root: string
	readonly pin: Omit<Pin, 'ids'> | undefined
	readonly routes: readonly Route[]
	/** The keys and links of its routes: one moved says nothing of the rows. */
	readonly links: ReadonlyMap<string, ReadonlySet<string>>
	readonly models: ReadonlySet<string>
}

/** The strings a condition on an id requires, if that is all it can be. */
function idsOf(
	condition: Condition | readonly Filter[] | undefined,
): readonly string[] | undefined {
	if (condition === undefined || isList(condition)) return undefined
	const { equals, in: some } = condition
	if (typeof equals === 'string') return [equals]
	const strings = some?.filter((id): id is string => typeof id === 'string')
	return strings?.length === some?.length ? strings : undefined
}

/** Whether a row of `model` can be walked along `step` to the row it leads to. */
const walkable = (models: Models, model: string, step: Step): boolean =>
	(step.keyOnTarget && step.inverse !== undefined) ||
	(!step.many && stores(models, model, step.relation))

/** The shortest pin `filter`, read on `model`'s rows, requires of each. */
function pinOf(
	models: Models,
	model: string,
	filter: Filter | undefined,
	path: readonly Step[],
): Pin | undefined {
	if (filter === undefined) return undefined
	const parts = required(filter)
	for (const part of parts) {
		const ids = idsOf(part.id)
		if (ids !== undefined) return { path, key: 'id', ids }
	}
	const relations = parts.flatMap((part) =>
		Object.entries(part).flatMap(([name, value]) => {
			const step = stepOf(models, model, name)
			return step === undefined || value === undefined || isList(value)
				? []
				: [{ step, value }]
		}),
	)
	for (const { step, value } of relations) {
		if (step.many || !stores(models, model, step.relation) || !value.is)
			continue
		for (const inner of required(value.is)) {
			const ids = idsOf(inner.id)
			if (ids !== undefined) return { path, key: step.relation, ids }
		}
	}
	let shortest: Pin | undefined
	for (const { step, value } of relations) {
		if (!walkable(models, model, step)) continue
		const next = [...path, step]
		const pin = pinOf(models, step.target, value.is ?? value.some, next)
		if (pin && pin.path.length < (shortest?.path.length ?? Infinity)) {
			shortest = pin
		}
	}
	return shortest
}

/** What a write can concern in `plan`, a live read of `model`. */
export function interestOfPlan(
	models: Models,
	model: string,
	plan: LivePlan,
	reach: Reach,
): Interest {
	return {
		root: model,
		pin: pinOf(models, model, plan.where, []),
		routes: [
			{ steps: [], model, fields: union(reach.placing, reach.showing) },
			...reach.levels.filter(({ steps }) => steps.length > 0),
			...reach.shown,
			...reach.deep.map(({ level, path }) => ({
				steps: path,
				model: level.model,
				fields: level.fields,
			})),
		],
	}
}

/** What a write can concern in `read`, which built a caller or a plan. */
export function interestOfRead(models: Models, read: Recorded): Interest {
	const { model, where, relation } = read
	const { further, filters, models: reached } = judgedOf(models, read)
	if (where === undefined || relation !== undefined) {
		const routes = [...reached].map((name): Route => ({
			steps: [],
			model: name,
			fields: 'all',
		}))
		return { root: model, pin: undefined, routes }
	}
	const fields =
		read.fields === undefined || filters === 'all'
			? 'all'
			: new Set([...read.fields, ...filters])
	return {
		root: model,
		pin: pinOf(models, model, where, []),
		routes: [{ steps: [], model, fields }, ...further],
	}
}

const named = (steps: readonly Step[]): string =>
	steps.map(({ relation }) => relation).join('.')

/** Its routes, one for each place they lead to. */
function merged(routes: readonly Route[]): ReadonlyMap<string, Route> {
	const by = new Map<string, Route>()
	for (const route of routes) {
		const name = `${named(route.steps)}@${route.model}`
		const known = by.get(name)
		by.set(
			name,
			known ? { ...route, fields: union(known.fields, route.fields) } : route,
		)
	}
	return by
}

/** The keys and links `steps` go through, from `root`. */
function linked(
	into: Map<string, Set<string>>,
	root: string,
	steps: readonly Step[],
): string {
	const add = (model: string, field: string): void => {
		into.set(model, (into.get(model) ?? new Set()).add(field))
	}
	let model = root
	for (const { relation, target, inverse } of steps) {
		add(model, relation)
		if (inverse !== undefined) add(target, inverse)
		model = target
	}
	return model
}

/** `interest`'s shape, under a key the reads of that shape share. */
export function shapeOf({ root, pin, routes }: Interest): Shape {
	// A row inserted or deleted on the way to a pin moves it, whatever the read shows.
	const ways = (pin?.path ?? []).map(({ target }, at): Route => ({
		steps: pin?.path.slice(0, at + 1) ?? [],
		model: target,
		fields: new Set(),
	}))
	const by = merged([...routes, ...ways])
	const links = new Map<string, Set<string>>()
	for (const { steps } of by.values()) linked(links, root, steps)
	if (pin !== undefined) {
		const last = linked(links, root, pin.path)
		if (pin.key !== 'id')
			links.set(last, (links.get(last) ?? new Set()).add(pin.key))
	}
	const key = JSON.stringify([
		root,
		pin && [named(pin.path), pin.key],
		[...by]
			.map(([name, { fields }]) => [
				name,
				fields === 'all' ? fields : [...fields].toSorted(),
			])
			.toSorted(([a], [b]) => String(a).localeCompare(String(b))),
	])
	return {
		key,
		root,
		pin: pin && { path: pin.path, key: pin.key },
		routes: [...by.values()],
		links,
		models: new Set([
			...[...by.values()].map(({ model }) => model),
			...links.keys(),
		]),
	}
}

/** The pins the root rows deleted held, `'all'` when they do not say. */
function deletedPins(
	{ path, key }: NonNullable<Shape['pin']>,
	deletes: readonly string[],
	changes: ModelChanges,
): readonly string[] | 'all' {
	if (deletes.length === 0 || (path.length === 0 && key === 'id'))
		return deletes
	if (path.length > 0) return 'all'
	const pins: string[] = []
	for (const id of deletes) {
		const held = changes.keys?.get(id)?.[key]
		if (held === undefined) return 'all'
		if (held !== null) pins.push(held)
	}
	return pins
}

/** The pins root rows `ids` lead to, `'all'` past what one read holds. */
async function pinsFrom(
	root: string,
	{ path, key }: NonNullable<Shape['pin']>,
	ids: readonly string[],
	loader: Loader,
): Promise<readonly string[] | 'all'> {
	if (ids.length === 0) return []
	let model = root
	let at = ids
	for (const step of path) {
		if (step.keyOnTarget && step.inverse !== undefined) {
			const held = await loader.holding(step.target, step.inverse, at)
			const next = new Set<string>()
			for (const found of held.values()) {
				if (found === undefined) return 'all'
				for (const row of found.rows) next.add(row.id)
			}
			at = [...next]
		} else {
			const rows = await loader.load(model, at)
			at = [...rows.values()].flatMap((row) => keyOf(row, step.relation) ?? [])
		}
		model = step.target
	}
	if (key === 'id') return at
	const rows = await loader.load(model, at)
	return [...rows.values()].flatMap((row) => keyOf(row, key) ?? [])
}

/**
 * The pins whose reads of `shape` a write in `batch` may concern; `'all'` when
 * no answer is sure, which a read that fails also means to the caller.
 */
export async function concernOf(
	shape: Shape,
	batch: Batch,
	loader: Loader,
): Promise<ReadonlySet<string> | 'all'> {
	const { root, pin, routes, links } = shape
	for (const [model, fields] of links) {
		const changes = batch.get(model)
		if (unlisted(changes) || touched(changes, fields)) return 'all'
	}
	const pins = new Set<string>()
	const roots = new Set<string>()
	for (const { steps, model, fields } of routes) {
		const changes = batch.get(model)
		if (changes === undefined) continue
		if (unlisted(changes)) return 'all'
		const deletes = listed(changes.deletes)
		const written = [
			...listed(changes.inserts),
			...(touched(changes, fields) ? listed(changes.updates) : []),
		]
		if (pin === undefined) {
			if (deletes.length + written.length > 0) return 'all'
			continue
		}
		if (steps.length > 0 && deletes.length > 0) return 'all'
		const held = deletedPins(pin, deletes, changes)
		if (held === 'all') return 'all'
		for (const id of held) pins.add(id)
		if (written.length === 0) continue
		const found =
			steps.length === 0 ? written : await loader.reaching(root, steps, written)
		if (found === undefined) return 'all'
		for (const id of found) roots.add(id)
	}
	if (pin === undefined) return pins
	const led = await pinsFrom(root, pin, [...roots], loader)
	if (led === 'all') return 'all'
	for (const id of led) pins.add(id)
	return pins
}
