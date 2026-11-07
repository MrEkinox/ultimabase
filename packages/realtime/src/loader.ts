// What a flush reads once for every live read that asks (D-154, D-252, D-255):
// each changed row, the rows related to it, the pages after a window's last.
import type { Filter, Row } from 'ultimabase'
import type { LivePlan, SharedReads } from 'ultimabase/internal'
import { storedRows } from 'ultimabase/internal'
import { Held, keyOf } from './needs.ts'
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
export const among = (ids: readonly string[]): Filter => ({
	id: { in: [...ids] },
})

/** Both filters, either of which may be absent. */
export const both = (
	a: Filter | undefined,
	b: Filter | undefined,
): Filter | undefined => (a && b ? { AND: [a, b] } : (a ?? b))

const named = (steps: readonly Step[]): string =>
	steps.map(({ relation }) => relation).join('.')

/** The root rows a flush reads for all its live reads, at most. */
const sharedRows = 10_000

/** The ids a read takes along for the rest of the flush, at most (D-263). */
const along = 1000

/** The rows a relation leads from, whose related rows a flush reads together. */
export type From = { readonly model: string; readonly relation: string }

/** One read of rows by id: a failure reaches whoever asks, once for them all. */
type Reading = Promise<ReadonlyMap<string, Row>>

/** One read of what holds some ids; nothing, past what one read holds. */
type Holding = Promise<ReadonlyMap<string, Held> | undefined>

/** Each plan's pages, keyed once rather than on each read. */
const pages = new WeakMap<LivePlan, string>()

/**
 * Each changed row, read once per flush whatever reads it, and each page
 * of rows after a window's last, once for the live reads that share it.
 */
export class Loader {
	/** Each row by id: kept whole, or the one read that brings it. */
	readonly #rows = new Map<string, Map<string, Row | Reading>>()
	readonly #pages = new Map<string, Promise<readonly Row[]>>()
	readonly #reaching = new Map<string, Promise<readonly string[] | undefined>>()
	/** The root rows each written row leads to, walked for every read (D-258). */
	readonly #led = new Map<string, ReadonlyMap<string, readonly string[]>>()
	readonly #holding = new Map<string, Map<string, Holding>>()
	/** Related rows too many to read together: each reader reads its own. */
	readonly #apart = new Set<string>()
	readonly #counts = new Map<string, Promise<number>>()
	/** The rows of each model that a flush may ask for, read with the first. */
	readonly #expected = new Map<string, Set<string>>()
	/** A flush's adapter reads, for the live reads that ask the same (D-252). */
	readonly reads: SharedReads | undefined

	constructor(reads?: SharedReads) {
		this.reads = reads
	}

	#known(model: string): Map<string, Row | Reading> {
		const known = this.#rows.get(model) ?? new Map<string, Row | Reading>()
		this.#rows.set(model, known)
		return known
	}

	/** The rows of `model` read whole so far. */
	*#read(model: string): Iterable<Row> {
		for (const row of this.#known(model).values()) {
			if (!(row instanceof Promise)) yield row
		}
	}

	/**
	 * The first stored rows of `plan`'s own filter that pass `after`, whose rows
	 * `load` then gives.
	 */
	async after(
		model: string,
		plan: LivePlan,
		after: Filter | undefined,
		take: number,
	): Promise<readonly Row[]> {
		const { filter, orderBy } = plan
		const base = pages.get(plan) ?? JSON.stringify([model, filter, orderBy])
		pages.set(plan, base)
		const key = `${base} ${JSON.stringify(after)} ${take}`
		let found = this.#pages.get(key)
		if (found === undefined) {
			const where = both(filter, after)
			found = storedRows(model, {
				...(where && { where }),
				orderBy,
				take,
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
		const path = `${model} ${named(steps)}`
		const led = this.#led.get(path)
		if (led !== undefined && ids.every((id) => led.has(id))) {
			return Promise.resolve([
				...new Set(ids.flatMap((id) => led.get(id) ?? [])),
			])
		}
		const key = `${path} ${ids.join()}`
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

	/** Keeps what `led` found of the `model` rows that `steps` reach: no query. */
	lead(
		model: string,
		steps: readonly Step[],
		led: ReadonlyMap<string, readonly string[]>,
	): void {
		const path = `${model} ${named(steps)}`
		this.#led.set(path, new Map([...(this.#led.get(path) ?? []), ...led]))
	}

	/**
	 * The `model` rows whose key `key` holds each of `ids`, once for the live
	 * reads that ask (D-255), with those of the rows read of `from` (D-263);
	 * `undefined` past what one read holds.
	 */
	async holding(
		model: string,
		key: string,
		ids: readonly string[],
		from?: string,
	): Promise<ReadonlyMap<string, Held | undefined>> {
		const name = `${model} ${key}`
		const known = this.#holding.get(name) ?? new Map<string, Holding>()
		this.#holding.set(name, known)
		const missing = ids.filter((id) => !known.has(id))
		if (missing.length > 0) {
			const wanted = new Set(missing)
			if (from !== undefined && !this.#apart.has(name)) {
				for (const { id } of this.#read(from)) {
					if (wanted.size >= along) break
					if (!known.has(id)) wanted.add(id)
				}
			}
			const read = storedRows(model, {
				where: { [key]: { is: among([...wanted]) } },
				take: sharedRows + 1,
			}).then((rows) => {
				if (rows.length > sharedRows) {
					if (wanted.size > missing.length) {
						this.#apart.add(name)
						for (const id of wanted) known.delete(id)
					}
					return undefined
				}
				this.keep(model, rows)
				const groups = Map.groupBy(rows, (row) => keyOf(row, key))
				return new Map(
					[...wanted].map((id) => [id, new Held(groups.get(id) ?? [])]),
				)
			})
			for (const id of wanted) known.set(id, read)
		}
		const found = new Map<string, Held | undefined>()
		for (const id of ids) found.set(id, (await known.get(id))?.get(id))
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

	/** The related ids that the rows read of `from` hold. */
	#ledBy({ model, relation }: From): ReadonlySet<string> {
		const led = new Set<string>()
		for (const row of this.#read(model)) {
			if (led.size >= along) break
			const key = keyOf(row, relation)
			if (key !== undefined) led.add(key)
		}
		return led
	}

	/**
	 * The `ids` of `model` some read of this flush will likely ask for: the first
	 * `load` that misses reads them all, rather than each reader its own.
	 */
	expect(model: string, ids: Iterable<string>): void {
		const expected = this.#expected.get(model) ?? new Set()
		for (const id of ids) expected.add(id)
		this.#expected.set(model, expected)
		this.reads?.expect(model, ids)
	}

	/**
	 * The stored rows of `model` in `ids`, a deleted row missing, with those the
	 * rows read of `from` lead to (D-263).
	 */
	async load(
		model: string,
		ids: readonly string[],
		from?: From,
	): Promise<ReadonlyMap<string, Row>> {
		const known = this.#known(model)
		let missing = ids.filter((id) => !known.has(id))
		if (missing.length > 0) {
			if (from !== undefined) this.expect(model, this.#ledBy(from))
			const expected = this.#expected.get(model)
			if (expected !== undefined && expected.size <= sharedRows) {
				this.#expected.delete(model)
				for (const id of missing) expected.add(id)
				missing = [...expected].filter((id) => !known.has(id))
			}
			const read = storedRows(model, { where: among(missing) }).then((rows) => {
				const found = new Map<string, Row>()
				for (const row of rows) {
					found.set(row.id, row)
					known.set(row.id, row)
				}
				return found
			})
			for (const id of missing) known.set(id, read)
		}
		const found = new Map<string, Row>()
		for (const id of ids) {
			// A kept row is no promise: awaiting each would cost a turn.
			const kept = known.get(id)
			const row = kept instanceof Promise ? (await kept).get(id) : kept
			if (row !== undefined) found.set(id, row)
		}
		return found
	}
}
