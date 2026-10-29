// Where a live read reaches (D-154): the fields its filter and order read on
// its own rows, the relations its filter goes through, level by level, and
// the relations its selection shows, so a write is followed only where it
// lands.
import type { Condition, Filter, Nested, Schema, SchemaField } from 'ultimabase'
import type { Fields } from './changes.ts'
import type { LivePlan } from 'ultimabase/internal'

/** A relation followed from one model to the next. */
export type Step = {
	readonly relation: string
	readonly many: boolean
	readonly target: string
	readonly inverse: string
	/** The target stores the key: a link changes there, out of sight. */
	readonly keyOnTarget: boolean
}

/** A level of a filter: its rows are those its steps reach from the root. */
export type Level = {
	readonly steps: readonly Step[]
	readonly model: string
	/** The fields it reads, the key back to the level above included. */
	readonly fields: Fields
	/** Under `NOT`, `isNot`, `every`, `none` or `is: null`: a lost link may add a row. */
	readonly negative: boolean
}

/** A relation the selection shows, or counts. */
export type Shown = {
	/** The relations from the root, joined by dots. */
	readonly path: string
	readonly steps: readonly Step[]
	readonly model: string
	/** The fields of its rows that show, or decide which rows show. */
	readonly fields: Fields
	/** A `_count`: its rows are not in the result to track. */
	readonly counted: boolean
}

export type Reach = {
	/** The filter's levels, the root's first. */
	readonly levels: readonly Level[]
	/** The fields that place a root row: its filter's and its order's. */
	readonly placing: Fields
	/** The root fields that show. */
	readonly showing: Fields
	readonly shown: readonly Shown[]
	/** Models a nested filter or order reaches further: any change resends all. */
	readonly deep: ReadonlySet<string>
}

type Models = ReadonlyMap<string, ReadonlyMap<string, SchemaField>>

const indexes = new WeakMap<Schema, Models>()

/** `schema`'s fields by model and name. */
export function modelsOf(schema: Schema): Models {
	const known = indexes.get(schema)
	if (known !== undefined) return known
	const models = new Map(
		schema.models.map(({ name, fields }) => [
			name,
			new Map(fields.map((field) => [field.name, field])),
		]),
	)
	indexes.set(schema, models)
	return models
}

/** The relation `name` of `model`, if it is one. */
export function stepOf(
	models: Models,
	model: string,
	name: string,
): Step | undefined {
	const field = models.get(model)?.get(name)
	if (field === undefined || field.kind === 'scalar') return undefined
	const back = models.get(field.target)?.get(field.inverse)
	return {
		relation: name,
		many: field.kind === 'many',
		target: field.target,
		inverse: field.inverse,
		keyOnTarget: back?.kind === 'one' && back.stored,
	}
}

const relationKeys = ['is', 'isNot', 'some', 'every', 'none'] as const

/** What a nested read selects. */
type Read = Pick<Nested, 'include' | 'count' | 'fields'>

const isList = (
	value: Condition | readonly Filter[],
): value is readonly Filter[] => Array.isArray(value)

/**
 * Adds the levels of `filter`, read on `model`'s rows, to `levels`; returns
 * the fields it reads on them.
 */
export function walk(
	models: Models,
	model: string,
	filter: Filter | undefined,
	steps: readonly Step[],
	negative: boolean,
	levels: Level[],
): Fields {
	const fields = new Set<string>()
	const back = steps.at(-1)
	if (back !== undefined) fields.add(back.inverse)
	let all = false
	const visit = (part: Filter | undefined, under: boolean): void => {
		for (const [key, value] of Object.entries(part ?? {})) {
			if (value === undefined) continue
			if (isList(value)) {
				for (const inner of value) visit(inner, under || key === 'NOT')
				continue
			}
			if (key === '_search') all = true
			fields.add(key)
			const step = stepOf(models, model, key)
			if (step === undefined) continue
			for (const condition of relationKeys) {
				const inner = value[condition]
				if (inner === undefined) continue
				const lost =
					condition === 'is'
						? inner === null
						: condition !== 'some' && !(condition === 'isNot' && inner === null)
				const next = [...steps, step]
				walk(models, step.target, inner ?? {}, next, under || lost, levels)
			}
		}
	}
	visit(filter, negative)
	const read = all ? 'all' : fields
	levels.push({ steps, model, fields: read, negative })
	return read
}

/** The fields a nested read shows: `'all'` when it lists none. */
function showing(nested: Read, also: readonly string[] = []): Fields {
	if (nested.fields === undefined) return 'all'
	return new Set([
		...nested.fields,
		...Object.keys(nested.include ?? {}),
		...Object.keys(nested.count ?? {}),
		...also,
	])
}

const union = (a: Fields, b: Fields): Fields =>
	a === 'all' || b === 'all' ? 'all' : new Set([...a, ...b])

/** The models a nested filter or order reaches beyond `model`. */
function further(
	models: Models,
	model: string,
	where: Filter | undefined,
	orderBy: Nested['orderBy'],
	deep: Set<string>,
): Fields {
	const levels: Level[] = []
	const fields = walk(models, model, where, [], false, levels)
	for (const level of levels) {
		if (level.steps.length > 0) deep.add(level.model)
	}
	for (const order of orderBy ?? []) {
		let on = model
		for (const { relation } of order.through ?? []) {
			on = stepOf(models, on, relation)?.target ?? on
			deep.add(on)
		}
		const counted = order.count && stepOf(models, on, order.field)
		if (counted) deep.add(counted.target)
	}
	return fields
}

/** Adds what `nested`, read on `model`'s rows at `path`, shows. */
function walkShown(
	models: Models,
	model: string,
	nested: Read,
	at: { readonly path: string; readonly steps: readonly Step[] },
	shown: Shown[],
	deep: Set<string>,
): void {
	const named = (name: string) => (at.path ? `${at.path}.${name}` : name)
	for (const [name, inner] of Object.entries(nested.include ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const steps = [...at.steps, step]
		const filtered = further(
			models,
			step.target,
			inner.where,
			inner.orderBy,
			deep,
		)
		const fields = union(showing(inner, [step.inverse]), filtered)
		shown.push({
			path: named(name),
			steps,
			model: step.target,
			fields,
			counted: false,
		})
		walkShown(
			models,
			step.target,
			inner,
			{ path: named(name), steps },
			shown,
			deep,
		)
	}
	for (const [name, where] of Object.entries(nested.count ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const filtered = further(models, step.target, where, undefined, deep)
		shown.push({
			path: named(`_count.${name}`),
			steps: [...at.steps, step],
			model: step.target,
			fields: union(new Set([step.inverse]), filtered),
			counted: true,
		})
	}
}

/** Where `plan`, a live read of `model`, reaches. */
export function reachOf(schema: Schema, model: string, plan: LivePlan): Reach {
	const models = modelsOf(schema)
	const levels: Level[] = []
	const root = walk(models, model, plan.where, [], false, levels)
	levels.reverse()
	const order = new Set(plan.orderBy.map(({ field }) => field))
	const shown: Shown[] = []
	const deep = new Set<string>()
	walkShown(models, model, plan, { path: '', steps: [] }, shown, deep)
	return {
		levels,
		placing: union(root, order),
		showing: showing(plan),
		shown,
		deep,
	}
}
