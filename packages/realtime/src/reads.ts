// The reads a flush makes (D-154): the root rows a relation's rows reach,
// a filter checked on a few rows, in memory when it reads the row alone,
// and each changed row loaded once for every live read that needs it.
import type { Filter, Nested, Row } from 'ultimabase'
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

/** Finds root rows of `model` through one indexed query per call. */
export const finderOf =
	(model: string): Finder =>
	async (steps, ids, within) => {
		const reach = through(steps, among(ids))
		const where = within === undefined ? reach : { AND: [among(within), reach] }
		const rows = await storedRows(model, { where, fields: ['id'] })
		return rows.map(({ id }) => id)
	}

/**
 * Each changed row, read once per flush whatever reads it, and each page
 * of rows after a window's last, once for the live reads that share it.
 */
export class Loader {
	readonly #rows = new Map<string, Map<string, Promise<Row | undefined>>>()
	readonly #pages = new Map<string, Promise<readonly Row[]>>()

	#known(model: string): Map<string, Promise<Row | undefined>> {
		const known =
			this.#rows.get(model) ?? new Map<string, Promise<Row | undefined>>()
		this.#rows.set(model, known)
		return known
	}

	/** The stored rows `read` finds, whose rows `load` then gives. */
	async after(model: string, read: Nested): Promise<readonly Row[]> {
		const key = JSON.stringify([model, read])
		let page = this.#pages.get(key)
		if (page === undefined) {
			page = storedRows(model, read)
			this.#pages.set(key, page)
			const rows = await page
			const known = this.#known(model)
			for (const row of rows) {
				if (!known.has(row.id)) known.set(row.id, Promise.resolve(row))
			}
		}
		return page
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
			const row = await known.get(id)
			if (row !== undefined) found.set(id, row)
		}
		return found
	}
}

/** The ids of `rows` that pass `filter`: in memory when it reads the row alone. */
export async function pass(
	model: string,
	rows: ReadonlyMap<string, Row>,
	filter: Filter | undefined,
): Promise<ReadonlySet<string>> {
	if (filter === undefined || rows.size === 0) return new Set(rows.keys())
	if (inMemory(model, filter)) {
		const kept = [...rows.values()].filter((row) => matches(model, row, filter))
		return new Set(kept.map(({ id }) => id))
	}
	const where = { AND: [among([...rows.keys()]), filter] }
	const kept = await storedRows(model, { where, fields: ['id'] })
	return new Set(kept.map(({ id }) => id))
}
