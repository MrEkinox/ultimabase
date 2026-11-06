// What a write can concern in a live read (D-256): the routes from the models
// it reaches back to its root, and the ids its filter requires of every row.
import type { Condition, Filter } from 'ultimabase'
import type { LivePlan, Recorded } from 'ultimabase/internal'
import { required } from 'ultimabase/internal'
import type { Fields } from './changes.ts'
import type { Models, Reach, Step } from './reach.ts'
import { isList, stepOf, stores, union } from './reach.ts'
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
