// The reads a flush makes (D-154): the root rows a relation's rows reach,
// a filter checked on a few rows, in memory when it reads the row alone,
// and each changed row loaded once for every live read that needs it.
import type { Filter, Nested, Order, Row } from 'ultimabase'
import type { LivePlan, SharedReads } from 'ultimabase/internal'
import { inMemory, matches, storedRows } from 'ultimabase/internal'
import type { Finder } from './affected.ts'
import type { Step } from './reach.ts'

/** A filter on the root that holds when `steps` reach a row passing `inner`. */
export const through = (steps: readonly Step[], inner: Filter): Filter =>
	steps.reduceRight<Filter>(
		(filter, { relation, many }) => ({
			[relation]: many ? { some: filter } : { is: filter },
		}),
		inner,
	)

/** The `model` rows in `ids`, as one filter. */
const among = (ids: readonly string[]): Filter => ({ id: { in: [...ids] } })

/**
 * Finds root rows of `model`, read once per flush for every live read that
 * asks (D-252); past what one read holds, one query for the rows of a window.
 */
export const finderOf =
	(model: string, loader: Loader): Finder =>
	async (steps, ids, within) => {
		const shared = await loader.reaching(model, steps, ids)
		if (shared !== undefined) {
			return within === undefined
				? shared
				: shared.filter((id) => within.has(id))
		}
		const reach = through(steps, among(ids))
		const where =
			within === undefined ? reach : { AND: [among([...within.keys()]), reach] }
		const rows = await storedRows(model, { where, fields: ['id'] })
		return rows.map(({ id }) => id)
	}

/** The rows after `last` in `orderBy`, `take` of them. */
export const page = (
	orderBy: readonly Order[],
	last: string | undefined,
	take: number,
): Nested => ({
	orderBy,
	...(last !== undefined && { cursor: { id: { equals: last } }, skip: 1 }),
	take,
})

/**
 * The stored rows after `last`, from the plan's `where` and in order: from the
 * flush's read of the read's own filter when its rights, checked in memory,
 * leave enough.
 */
export async function rowsAfter(
	model: string,
	plan: LivePlan,
	last: string | undefined,
	take: number,
	loader?: Loader,
): Promise<readonly Row[]> {
	const { where, rights, orderBy } = plan
	if (loader !== undefined && inMemory(model, rights)) {
		const rows = await loader.after(model, plan, last, take)
		const kept = rows.filter((row) => matches(model, row, rights))
		if (kept.length >= take || rows.length < take) return kept.slice(0, take)
	}
	return storedRows(model, {
		...(where && { where }),
		...page(orderBy, last, take),
		fields: orderBy.map(({ field }) => field),
	})
}

/** The root rows a flush reads for all its live reads, at most. */
const sharedRows = 10_000

/** Each plan's pages, keyed once rather than on each read. */
const pages = new WeakMap<LivePlan, string>()

/**
 * Each changed row, read once per flush whatever reads it, and each page
 * of rows after a window's last, once for the live reads that share it.
 */
export class Loader {
	/** Each row by id: kept whole, or being read. */
	readonly #rows = new Map<
		string,
		Map<string, Row | Promise<Row | undefined>>
	>()
	readonly #pages = new Map<string, Promise<readonly Row[]>>()
	readonly #reaching = new Map<string, Promise<readonly string[] | undefined>>()
	readonly #counts = new Map<string, Promise<number>>()
	/** A flush's adapter reads, for the live reads that ask the same (D-252). */
	readonly reads: SharedReads | undefined

	constructor(reads?: SharedReads) {
		this.reads = reads
	}

	#known(model: string): Map<string, Row | Promise<Row | undefined>> {
		const known =
			this.#rows.get(model) ?? new Map<string, Row | Promise<Row | undefined>>()
		this.#rows.set(model, known)
		return known
	}

	/**
	 * The stored rows of `plan`'s own filter after `last`, whose rows `load`
	 * then gives.
	 */
	async after(
		model: string,
		plan: LivePlan,
		last: string | undefined,
		take: number,
	): Promise<readonly Row[]> {
		const { filter, orderBy } = plan
		const base = pages.get(plan) ?? JSON.stringify([model, filter, orderBy])
		pages.set(plan, base)
		const key = `${base} ${last} ${take}`
		let found = this.#pages.get(key)
		if (found === undefined) {
			found = storedRows(model, {
				...(filter && { where: filter }),
				...page(orderBy, last, take),
			})
			this.#pages.set(key, found)
			this.keep(model, await found)
		}
		return found
	}

	/**
	 * The `model` rows that reach one of `ids` through `steps`, once for the
	 * live reads that share them; `undefined` past what one read holds.
	 */
	reaching(
		model: string,
		steps: readonly Step[],
		ids: readonly string[],
	): Promise<readonly string[] | undefined> {
		const path = steps.map(({ relation }) => relation).join('.')
		const key = `${model} ${path} ${ids.join()}`
		let found = this.#reaching.get(key)
		if (found === undefined) {
			found = storedRows(model, {
				where: through(steps, among(ids)),
				fields: ['id'],
				take: sharedRows + 1,
			}).then((rows) =>
				rows.length > sharedRows ? undefined : rows.map(({ id }) => id),
			)
			this.#reaching.set(key, found)
		}
		return found
	}

	/** A count, once for the live reads with the same `model` and `where`. */
	async counted(
		model: string,
		where: Filter | undefined,
		count: () => Promise<number>,
	): Promise<number> {
		const key = JSON.stringify([model, where])
		const known = this.#counts.get(key)
		if (known !== undefined) return known
		const found = count()
		this.#counts.set(key, found)
		return found
	}

	/** Keeps `rows`, read whole, for `load` to give. */
	keep(model: string, rows: readonly Row[]): void {
		const known = this.#known(model)
		for (const row of rows) {
			if (!known.has(row.id)) known.set(row.id, row)
		}
	}

	/** The stored rows of `model` in `ids`; a deleted row is missing. */
	async load(
		model: string,
		ids: readonly string[],
	): Promise<ReadonlyMap<string, Row>> {
		const known = this.#known(model)
		const missing = ids.filter((id) => !known.has(id))
		if (missing.length > 0) {
			const read = storedRows(model, { where: among(missing) }).then(
				(rows) => new Map(rows.map((row) => [row.id, row])),
			)
			for (const id of missing) {
				known.set(
					id,
					read.then((rows) => rows.get(id)),
				)
			}
		}
		const found = new Map<string, Row>()
		for (const id of ids) {
			// A kept row is no promise: awaiting each would cost a turn.
			const kept = known.get(id)
			const row = kept instanceof Promise ? await kept : kept
			if (row !== undefined) found.set(id, row)
		}
		return found
	}
}

/** A filter's conditions: those a row answers alone, and the others. */
type Split = { readonly local: Filter; readonly rest: readonly Filter[] }

const splits = new WeakMap<Filter, Split>()

/** Each condition `filter` requires of a row. */
const required = (filter: Filter): readonly Filter[] =>
	Object.entries(filter).flatMap(([key, value]): readonly Filter[] => {
		if (value === undefined) return []
		return key === 'AND' && Array.isArray(value)
			? value.flatMap(required)
			: [{ [key]: value }]
	})

function splitOf(model: string, filter: Filter): Split {
	const known = splits.get(filter)
	if (known !== undefined) return known
	const parts = required(filter)
	const split = {
		local: { AND: parts.filter((part) => inMemory(model, part)) },
		rest: parts.filter((part) => !inMemory(model, part)),
	}
	splits.set(filter, split)
	return split
}

/**
 * The ids of `rows` that pass `filter`: what a row answers alone in memory,
 * and a query only for the rows that pass that (D-252).
 */
export async function pass(
	model: string,
	rows: ReadonlyMap<string, Row>,
	filter: Filter | undefined,
): Promise<ReadonlySet<string>> {
	if (filter === undefined || rows.size === 0) return new Set(rows.keys())
	const { local, rest } = splitOf(model, filter)
	const kept = [...rows.values()]
		.filter((row) => matches(model, row, local))
		.map(({ id }) => id)
	if (kept.length === 0 || rest.length === 0) return new Set(kept)
	const where = { AND: [among(kept), ...rest] }
	const passed = await storedRows(model, { where, fields: ['id'] })
	return new Set(passed.map(({ id }) => id))
}
