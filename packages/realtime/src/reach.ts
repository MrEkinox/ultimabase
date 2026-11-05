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
	/** The target's side, absent when none (D-237). */
	readonly inverse?: string
	/** The target stores the key: a link changes there, out of sight. */
	readonly keyOnTarget: boolean
}

/** A level of a filter: its rows are those its steps reach from the root. */
export type Level = {
	readonly steps: readonly Step[]
	readonly model: string
	/**
	 * The fields whose update may change which of its rows pass: those it
	 * reads that its rows store, and the key back to the level above. A
	 * relation it goes through is judged at the level it leads to (D-196).
	 */
	readonly fields: Fields
	/** Under `NOT`, `isNot`, `every`, `none` or `is: null`: a lost link may add a row. */
	readonly negative: boolean
	/** The conditions its rows pass, as the filter writes them there. */
	readonly filter: Filter
}

/** A relation the selection shows, or counts. */
export type Shown = {
	readonly steps: readonly Step[]
	readonly model: string
	/** The fields of its rows that show, or decide which rows show. */
	readonly fields: Fields
}

/** A level of a shown relation's filter or order, past its own rows. */
export type Deep = {
	readonly level: Level
	/** The relations from the root to its rows, none for a step back to a parent. */
	readonly path: readonly Step[]
	/** Its rows are the parents of the rows it filters, which their delete tells. */
	readonly parent: boolean
}

export type Reach = {
	/** The filter's levels, the root's first. */
	readonly levels: readonly Level[]
	/** The fields that place a root row: its filter's and its order's. */
	readonly placing: Fields
	/** The root fields that show. */
	readonly showing: Fields
	readonly shown: readonly Shown[]
	/** The levels a nested filter or order reaches further (D-252). */
	readonly deep: readonly Deep[]
	/** Every model above: a write to any other leaves the read as it was (D-255). */
	readonly models: ReadonlySet<string>
}

export type Models = ReadonlyMap<string, ReadonlyMap<string, SchemaField>>

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

/** The target's field facing a step, none for a `one` without one (D-237). */
export const facingOf = (step: Step): string[] =>
	step.inverse === undefined ? [] : [step.inverse]

/** The relation `name` of `model`, if it is one. */
export function stepOf(
	models: Models,
	model: string,
	name: string,
): Step | undefined {
	const field = models.get(model)?.get(name)
	if (field === undefined || field.kind === 'scalar') return undefined
	const { inverse } = field
	const back =
		inverse === undefined ? undefined : models.get(field.target)?.get(inverse)
	return {
		relation: name,
		many: field.kind === 'many',
		target: field.target,
		...(inverse === undefined ? {} : { inverse }),
		keyOnTarget: back?.kind === 'one' && back.stored,
	}
}

/** Whether `model`'s rows store `name`: no relation, or a key they hold. */
export function stores(models: Models, model: string, name: string): boolean {
	const field = models.get(model)?.get(name)
	return field?.kind !== 'many' && (field?.kind !== 'one' || field.stored)
}

const relationKeys = ['is', 'isNot', 'some', 'every', 'none'] as const

/** What a nested read selects. */
type Read = Pick<Nested, 'include' | 'count' | 'fields'>

export const isList = (
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
	for (const name of back ? facingOf(back) : []) fields.add(name)
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
	const own =
		read === 'all'
			? read
			: new Set(
					[...read].filter(
						(name) => name === back?.inverse || stores(models, model, name),
					),
				)
	levels.push({ steps, model, fields: own, negative, filter: filter ?? {} })
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

/**
 * `steps` without a step back: a row's key to the row that shows it reaches
 * that row and no other.
 */
function deepOf(level: Level, steps: readonly Step[]): Deep {
	const path: Step[] = []
	let parent = false
	for (const step of steps) {
		const last = path.at(-1)
		parent = last?.keyOnTarget === true && last.inverse === step.relation
		if (parent) path.pop()
		else path.push(step)
	}
	return { level, path, parent }
}

/** A level no filter names: `fields` decide what its rows show. */
const plainLevel = (
	model: string,
	steps: readonly Step[],
	fields: readonly string[],
): Level => ({
	steps,
	model,
	fields: new Set(fields),
	negative: false,
	filter: {},
})

/** The levels `orderBy`, read on `model`'s rows, reaches beyond them. */
function orderLevels(
	models: Models,
	model: string,
	order: NonNullable<Nested['orderBy']>[number],
): Level[] {
	const levels: Level[] = []
	const steps: Step[] = []
	let on = model
	const through = order.through ?? []
	for (const [at, { relation }] of through.entries()) {
		const step = stepOf(models, on, relation)
		if (step === undefined) break
		steps.push(step)
		on = step.target
		const next = through[at + 1]?.relation ?? order.field
		levels.push(plainLevel(on, [...steps], [next, ...facingOf(step)]))
	}
	const counted = order.count && stepOf(models, on, order.field)
	if (counted) {
		const facing = facingOf(counted)
		levels.push(plainLevel(counted.target, [...steps, counted], facing))
	}
	return levels
}

/** Adds the levels a nested filter or order reaches beyond `model`. */
function further(
	models: Models,
	model: string,
	where: Filter | undefined,
	orderBy: Nested['orderBy'],
	to: readonly Step[],
	deep: Deep[],
): Fields {
	const levels: Level[] = []
	const fields = walk(models, model, where, [], false, levels)
	for (const order of orderBy ?? []) {
		levels.push(...orderLevels(models, model, order))
	}
	for (const level of levels) {
		if (level.steps.length > 0) {
			deep.push(deepOf(level, [...to, ...level.steps]))
		}
	}
	return fields
}

/** Adds what `nested`, read on `model`'s rows through `at`, shows. */
function walkShown(
	models: Models,
	model: string,
	nested: Read,
	at: readonly Step[],
	shown: Shown[],
	deep: Deep[],
): void {
	for (const [name, inner] of Object.entries(nested.include ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const steps = [...at, step]
		const filtered = further(
			models,
			step.target,
			inner.where,
			inner.orderBy,
			steps,
			deep,
		)
		const fields = union(showing(inner, facingOf(step)), filtered)
		shown.push({ steps, model: step.target, fields })
		walkShown(models, step.target, inner, steps, shown, deep)
	}
	for (const [name, where] of Object.entries(nested.count ?? {})) {
		const step = stepOf(models, model, name)
		if (step === undefined) continue
		const steps = [...at, step]
		const filtered = further(models, step.target, where, undefined, steps, deep)
		const fields = union(new Set(facingOf(step)), filtered)
		shown.push({ steps, model: step.target, fields })
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
	const deep: Deep[] = []
	walkShown(models, model, plan, [], shown, deep)
	return {
		levels,
		placing: union(root, order),
		showing: showing(plan),
		shown,
		deep,
		models: new Set([
			...levels.map((level) => level.model),
			...shown.map((relation) => relation.model),
			...deep.map(({ level }) => level.model),
		]),
	}
}
