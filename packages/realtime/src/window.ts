// A live list's window (D-154): the first rows of its order, each kept as
// its id and sort keys, never as the row it shows, and one row more, which
// says whether rows follow without a read. A row is placed by a binary
// search; one placed after the last row, when rows may follow, is outside.
import type { Order } from 'ultimabase'
import { compareKeys } from 'ultimabase/internal'

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
	entries: Entry[] = []
	/** Rows may follow the last entry. */
	rest = false
	first: number
	readonly #orderBy: readonly Order[]

	constructor(orderBy: readonly Order[], first: number) {
		this.#orderBy = orderBy
		this.first = first
	}

	/** The rows a client shows. */
	shown(): readonly Entry[] {
		return this.entries.slice(0, this.first)
	}

	hasMore(): boolean {
		return this.entries.length > this.first
	}

	ids(): ReadonlySet<string> {
		return new Set(this.entries.map(({ id }) => id))
	}

	/** How many rows a read after the last entry must bring. */
	missing(): number {
		return this.rest ? this.first + 1 - this.entries.length : 0
	}

	/** Adds the rows read after the last entry. */
	fill(entries: readonly Entry[], rest: boolean): void {
		this.entries.push(...entries)
		this.rest = rest
	}

	remove(id: string): boolean {
		const at = this.entries.findIndex((entry) => entry.id === id)
		if (at === -1) return false
		this.entries.splice(at, 1)
		return true
	}

	/** Places a row that passes the filter, or leaves it outside. */
	place(entry: Entry): void {
		this.remove(entry.id)
		const { entries } = this
		let low = 0
		let high = entries.length
		while (low < high) {
			const middle = (low + high) >> 1
			const keys = entries[middle]?.keys ?? []
			if (compareKeys(keys, entry.keys, this.#orderBy) < 0) low = middle + 1
			else high = middle
		}
		if (low === entries.length && this.rest) return
		entries.splice(low, 0, entry)
		if (entries.length > this.first + 1) {
			entries.pop()
			this.rest = true
		}
	}

	/** How `before`, the rows shown, became those shown now. */
	moves(before: readonly Entry[], again: ReadonlySet<string>): Moves {
		const old = new Map(before.map((entry) => [entry.id, entry.keys]))
		const shown = this.shown()
		const kept = new Set(shown.map(({ id }) => id))
		const removed = before.filter(({ id }) => !kept.has(id)).map(({ id }) => id)
		const placed = shown.flatMap((entry, at) => {
			const keys = old.get(entry.id)
			// The rows whose keys stayed keep their order among themselves.
			const still =
				keys !== undefined &&
				!again.has(entry.id) &&
				compareKeys(keys, entry.keys, this.#orderBy) === 0
			if (still) return []
			return [{ id: entry.id, after: shown[at - 1]?.id ?? null }]
		})
		return { removed, placed }
	}
}
