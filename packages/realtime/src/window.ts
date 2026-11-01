// A live list's window (D-154): the first rows of its order, each kept as
// its id and sort keys, never as the row it shows, and one row more, which
// says whether rows follow without a read. A row is placed and found by a
// binary search on its keys, which end with its id; one placed after the
// last row, when rows may follow, is outside.
// It notes the rows it changes since a mark, so what changed costs what was
// changed, not a pass over it.
import type { Order } from 'ultimabase'
import { compareKeys } from 'ultimabase/internal'
import type { Ids } from './affected.ts'

export type Entry = { readonly id: string; readonly keys: readonly unknown[] }

/** What changed between two windows, in the order a client applies it. */
export type Moves = {
	readonly removed: readonly string[]
	/** Each row placed again, after the row before it, `null` for the first. */
	readonly placed: readonly {
		readonly id: string
		readonly after: string | null
	}[]
}

export class Window {
	readonly #entries: Entry[] = []
	/** Each entry's keys by id: the ids, and where a binary search finds it. */
	readonly #keys = new Map<string, readonly unknown[]>()
	/** Rows may follow the last entry. */
	rest = false
	first: number
	readonly #orderBy: readonly Order[]
	/** The rows changed since the mark, each with its keys then, if it was in. */
	#was: Map<string, readonly unknown[] | undefined> | undefined
	/** The row past those shown at the mark. */
	#extra: string | undefined

	constructor(orderBy: readonly Order[], first: number) {
		this.#orderBy = orderBy
		this.first = first
	}

	/** Starts noting changes: `moves` tells those since. */
	mark(): void {
		this.#was = new Map()
		this.#extra = this.#entries[this.first]?.id
	}

	#note(id: string, keys: readonly unknown[] | undefined): void {
		const was = this.#was
		if (was !== undefined && !was.has(id)) was.set(id, keys)
	}

	/** The rows a client shows. */
	get entries(): readonly Entry[] {
		return this.#entries
	}

	shown(): readonly Entry[] {
		return this.#entries.slice(0, this.first)
	}

	hasMore(): boolean {
		return this.#entries.length > this.first
	}

	/** The ids of the entries, kept as they change. */
	ids(): Ids {
		return this.#keys
	}

	/** Where `keys` is or would go, the order being total. */
	#index(keys: readonly unknown[]): number {
		const entries = this.#entries
		let low = 0
		let high = entries.length
		while (low < high) {
			const middle = (low + high) >> 1
			const at = entries[middle]?.keys ?? []
			if (compareKeys(at, keys, this.#orderBy) < 0) low = middle + 1
			else high = middle
		}
		return low
	}

	/** How many rows a read after the last entry must bring. */
	missing(): number {
		return this.rest ? this.first + 1 - this.#entries.length : 0
	}

	/** Adds the rows read after the last entry. */
	fill(entries: readonly Entry[], rest: boolean): void {
		this.#entries.push(...entries)
		for (const { id, keys } of entries) {
			this.#note(id, undefined)
			this.#keys.set(id, keys)
		}
		this.rest = rest
	}

	remove(id: string): boolean {
		const keys = this.#keys.get(id)
		if (keys === undefined) return false
		this.#keys.delete(id)
		this.#note(id, keys)
		this.#entries.splice(this.#index(keys), 1)
		return true
	}

	/** Places a row that passes the filter, or leaves it outside. */
	place(entry: Entry): void {
		this.remove(entry.id)
		const entries = this.#entries
		const low = this.#index(entry.keys)
		if (low === entries.length && this.rest) return
		this.#note(entry.id, undefined)
		entries.splice(low, 0, entry)
		this.#keys.set(entry.id, entry.keys)
		const last = entries.length > this.first + 1 ? entries.pop() : undefined
		if (last !== undefined) {
			this.#note(last.id, last.keys)
			this.#keys.delete(last.id)
			this.rest = true
		}
	}

	/**
	 * How the rows shown at the mark, none before the first, became those
	 * shown now. Only the rows changed since, and the one past the shown rows
	 * then and now, may have come or gone.
	 */
	moves(again: ReadonlySet<string>): Moves {
		const entries = this.#entries
		const after = (at: number) => ({
			id: entries[at]?.id ?? '',
			after: entries[at - 1]?.id ?? null,
		})
		const notes = this.#was
		if (notes === undefined) {
			return { removed: [], placed: this.shown().map((_, at) => after(at)) }
		}
		const extra = entries[this.first]?.id
		const was = (id: string): boolean =>
			id !== this.#extra &&
			(notes.has(id) ? notes.get(id) !== undefined : this.#keys.has(id))
		const shown = (id: string): boolean => id !== extra && this.#keys.has(id)
		const ids = [
			...new Set([...notes.keys(), ...again, this.#extra, extra]),
		].filter((id) => id !== undefined)
		const removed = ids.filter((id) => was(id) && !shown(id))
		const placed = ids.flatMap((id) => {
			const keys = this.#keys.get(id)
			if (keys === undefined || !shown(id)) return []
			const at = this.#index(keys)
			const old = notes.get(id)
			// The rows whose keys stayed keep their order among themselves.
			const still =
				was(id) &&
				!again.has(id) &&
				(old === undefined || compareKeys(old, keys, this.#orderBy) === 0)
			return still ? [] : [at]
		})
		return { removed, placed: placed.toSorted((a, b) => a - b).map(after) }
	}
}
