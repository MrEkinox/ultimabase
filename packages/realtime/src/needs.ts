// What a row must pass for a filter to hold, read once per flush for every
// live read that asks (D-255): a rule naming the viewer through a relation
// costs each list a lookup, and a query only for those it may let read.
import type { Filter, Row } from 'ultimabase'
import { inMemory, liveSchema, matches, required } from 'ultimabase/internal'
import type { Models, Step } from './reach.ts'
import { isList, modelsOf, stepOf, stores } from './reach.ts'
import type { Loader } from './loader.ts'

/** A related id a filter names, on the relation holding it as a key. */
type Pin = { readonly relation: string; readonly id: string }

/** What a row of `model` must pass; a row passing it may still fail the filter. */
type Need = {
	readonly model: string
	/** What the row answers alone. */
	readonly own: Filter | undefined
	readonly pin: Pin | undefined
	readonly others: readonly Other[]
	/** It leaves nothing out: a row passing it passes the filter (D-259). */
	readonly whole: boolean
}

type Other = { readonly whole: boolean } & (
	| { readonly any: readonly Need[] }
	| { readonly step: Step; readonly need: Need }
)

/** Whether a related row was too many to hold, so a query must decide. */
type Doubt = { held: boolean }

/** A related row's id, as the row holds its key. */
export function keyOf(row: Row, relation: string): string | undefined {
	const key = row[relation]
	if (typeof key === 'string') return key
	const id =
		typeof key === 'object' && key !== null && 'id' in key ? key.id : undefined
	return typeof id === 'string' ? id : undefined
}

/** Rows too few for an index to spare anything. */
const fewRows = 8

/** Rows held for a flush, found by a related id once a filter names one. */
export class Held {
	readonly rows: readonly Row[]
	readonly #by = new Map<string, ReadonlyMap<string, readonly Row[]>>()

	constructor(rows: readonly Row[]) {
		this.rows = rows
	}

	/** The rows that may name `pin`: all of them, when they are few. */
	with({ relation, id }: Pin): readonly Row[] {
		if (this.rows.length <= fewRows) return this.rows
		let index = this.#by.get(relation)
		if (index === undefined) {
			const built = new Map<string, Row[]>()
			for (const row of this.rows) {
				const key = keyOf(row, relation)
				if (key === undefined) continue
				const rows = built.get(key)
				if (rows === undefined) built.set(key, [row])
				else rows.push(row)
			}
			index = built
			this.#by.set(relation, index)
		}
		return index.get(id) ?? []
	}
}

/** The related id `part`, a condition a row answers alone, names. */
function pinOf(models: Models, model: string, part: Filter): Pin | undefined {
	const [entry] = Object.entries(part)
	if (entry === undefined) return undefined
	const [relation, value] = entry
	if (value === undefined || isList(value)) return undefined
	if (stepOf(models, model, relation) === undefined) return undefined
	const id = value.is?.id
	if (id === undefined || isList(id)) return undefined
	return typeof id.equals === 'string' ? { relation, id: id.equals } : undefined
}

/** What `part`, which a row can't answer alone, requires; nothing when unknown. */
function otherOf(
	models: Models,
	model: string,
	part: Filter,
): Other | undefined {
	const [entry] = Object.entries(part)
	if (entry === undefined) return undefined
	const [key, value] = entry
	if (value === undefined) return undefined
	if (isList(value)) {
		if (key !== 'OR' || value.length === 0) return undefined
		const any = value.map((branch) => needOf(models, model, branch))
		return any.every((need) => need !== undefined)
			? { any, whole: any.every((need) => need.whole) }
			: undefined
	}
	const step = stepOf(models, model, key)
	const inner = value.some ?? value.is
	if (step === undefined || inner === undefined || inner === null) {
		return undefined
	}
	const readable =
		(step.keyOnTarget && step.inverse !== undefined) ||
		(!step.many && stores(models, model, key))
	const need = readable ? needOf(models, step.target, inner) : undefined
	if (need === undefined) return undefined
	const only = Object.values(value).filter((each) => each !== undefined)
	return { step, need, whole: need.whole && only.length === 1 }
}

function needOf(
	models: Models,
	model: string,
	filter: Filter,
): Need | undefined {
	const parts = required(filter)
	const own = parts.filter((part) => inMemory(model, part))
	const rest = parts.filter((part) => !inMemory(model, part))
	const others = rest.flatMap((part) => otherOf(models, model, part) ?? [])
	if (own.length === 0 && others.length === 0) return undefined
	return {
		whole:
			others.length === rest.length && others.every((other) => other.whole),
		model,
		own: own.length === 0 ? undefined : { AND: own },
		pin: own.flatMap((part) => pinOf(models, model, part) ?? [])[0],
		others,
	}
}

const needs = new WeakMap<Filter, Need | null>()

/** The rows of `held` that may pass `need`. */
async function keep(
	need: Need,
	held: Held,
	loader: Loader,
	doubt: Doubt,
): Promise<readonly Row[]> {
	const { model, own, pin, others } = need
	let rows = pin === undefined ? held.rows : held.with(pin)
	if (own !== undefined) rows = rows.filter((row) => matches(model, row, own))
	for (const other of others) {
		if (rows.length === 0) break
		rows = await ('any' in other
			? keepAny(other.any, rows, loader, doubt)
			: keepRelated(model, other, rows, loader, doubt))
	}
	return rows
}

async function keepAny(
	any: readonly Need[],
	rows: readonly Row[],
	loader: Loader,
	doubt: Doubt,
): Promise<readonly Row[]> {
	const held = new Held(rows)
	const kept = new Set<Row>()
	for (const need of any) {
		for (const row of await keep(need, held, loader, doubt)) kept.add(row)
	}
	return rows.filter((row) => kept.has(row))
}

async function keepRelated(
	model: string,
	{ step, need }: { readonly step: Step; readonly need: Need },
	rows: readonly Row[],
	loader: Loader,
	doubt: Doubt,
): Promise<readonly Row[]> {
	const related = await relatedOf(model, step, rows, loader)
	// Rows sharing a related row share its answer: a team's posts ask once.
	const answers = new Map<Held, boolean>()
	const kept: Row[] = []
	for (const row of rows) {
		const held = related(row)
		if (held === undefined) {
			// Too many to hold at once: the query decides.
			doubt.held = true
			kept.push(row)
			continue
		}
		let answer = answers.get(held)
		if (answer === undefined) {
			answer = (await keep(need, held, loader, doubt)).length > 0
			answers.set(held, answer)
		}
		if (answer) kept.push(row)
	}
	return kept
}

/** Finds a row's related rows, read once per flush with the others' (D-263). */
async function relatedOf(
	model: string,
	step: Step,
	rows: readonly Row[],
	loader: Loader,
): Promise<(row: Row) => Held | undefined> {
	const ids = rows.map(({ id }) => id)
	if (step.keyOnTarget && step.inverse !== undefined) {
		const holding = await loader.holding(step.target, step.inverse, ids, model)
		return (row) => holding.get(row.id)
	}
	const keys = rows.flatMap((row) => keyOf(row, step.relation) ?? [])
	const targets = await loader.load(step.target, keys, {
		model,
		relation: step.relation,
	})
	const helds = new Map<string | undefined, Held>()
	return (row) => {
		const key = keyOf(row, step.relation)
		let held = helds.get(key)
		if (held === undefined) {
			const target = key === undefined ? undefined : targets.get(key)
			held = new Held(target === undefined ? [] : [target])
			helds.set(key, held)
		}
		return held
	}
}

/**
 * The `rows` that may pass the `rest` of a filter, which only a query can
 * tell for sure, unless `sure`: the rows held then answered all of it (D-259).
 */
export async function possible(
	model: string,
	rows: readonly Row[],
	filter: Filter,
	loader: Loader,
): Promise<{ readonly rows: readonly Row[]; readonly sure: boolean }> {
	let need = needs.get(filter)
	if (need === undefined) {
		need = needOf(modelsOf(liveSchema()), model, filter) ?? null
		needs.set(filter, need)
	}
	if (need === null) return { rows, sure: false }
	const doubt = { held: false }
	const kept = await keep(need, new Held(rows), loader, doubt)
	return { rows: kept, sure: need.whole && !doubt.held }
}
