// A live list's window (D-154): the first rows of its order, each kept as
// its sort keys alone, its id among them (D-195), never as the row it shows,
// and one row more, which says whether rows follow without a read. A row is
// placed and found by a binary search on its keys, which the id makes
// total; one placed after the last row, when rows may follow, is outside.
// It notes the rows it changes since a mark, so what changed costs what was
// changed, not a pass over it. A row's keys end with a hash of what it was
// last sent as, which tells a row read again unchanged (D-252).
import type { Order } from 'ultimabase'
import { compareKeys } from 'ultimabase/internal'
import type { Ids } from './affected.ts'

/** A row's sort keys, its id among them. */
export type Keys = unknown[]

/** What changed between two windows, in the order a client applies it. */
export type Moves = {
	readonly removed: readonly string[]
	/** Each row placed again, after the row before it, `null` for the first. */
	readonly placed: readonly {
		readonly id: string
		readonly after: string | null
		/** It moved or is new, so a client needs it even if it reads the same. */
		readonly moved: boolean
	}[]
}

const mixed = (a: number, b: number): number =>
	Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)

/** A hash of 53 bits (cyrb53): a row whose hash stays is not sent again. */
function hashOf(text: string): number {
	let high = 0xdeadbeef
	let low = 0x41c6ce57
	for (let at = 0; at < text.length; at += 1) {
		const code = text.charCodeAt(at)
		high = Math.imul(high ^ code, 2654435761)
		low = Math.imul(low ^ code, 1597334677)
	}
	high = mixed(high, low)
	low = mixed(low, high)
	return 4294967296 * (2097151 & low) + (high >>> 0)
}

export class Window {
	readonly #entries: Keys[] = []
	/** Each entry's keys by id: the ids, and where a binary search finds it. */
	readonly #keys = new Map<string, Keys>()
	/** Where the keys hold the id. */
	readonly #at: number
	/** Where the keys hold the hash of what the row was last sent as. */
	readonly #sentAt: number
	/** Rows may follow the last entry. */
	rest = false
	first: number
	readonly #orderBy: readonly Order[]
	/** The rows changed since the mark, each with its keys then, if it was in. */
	#was: Map<string, Keys | undefined> | undefined
	/** The row past those shown at the mark. */
	#extra: string | undefined
	/** The first and last rows shown, as last told. */
	#ends: readonly string[] = []

	constructor(orderBy: readonly Order[], first: number) {
		this.#orderBy = orderBy
		this.first = first
		this.#at = orderBy.findIndex(({ field }) => field === 'id')
		this.#sentAt = orderBy.length
		if (this.#at < 0) throw new Error('A live order holds the id.')
	}

	#id(keys: Keys): string {
		return String(keys[this.#at])
	}

	/** The id of the entry at `at`, if any. */
	#idAt(at: number): string | undefined {
		const keys = this.#entries.at(at)
		return keys && this.#id(keys)
	}

	/** Starts noting changes: `moves` tells those since. */
	mark(): void {
		this.#was = new Map()
		this.#extra = this.#idAt(this.first)
	}

	#note(id: string, keys: Keys | undefined): void {
		const was = this.#was
		if (was !== undefined && !was.has(id)) was.set(id, keys)
	}

	/** Notes what a row is sent as: whether that is what it was last sent as. */
	sent(id: string, row: unknown): boolean {
		const keys = this.#keys.get(id) ?? []
		const hash = hashOf(JSON.stringify(row))
		const changed = keys[this.#sentAt] !== hash
		keys[this.#sentAt] = hash
		return changed
	}

	/** The keys of the last entry, the one past those shown if any. */
	lastKeys(): Keys | undefined {
		return this.#entries.at(-1)
	}

	/** The ids of the rows a client shows. */
	shown(): readonly string[] {
		return this.#entries.slice(0, this.first).map((keys) => this.#id(keys))
	}

	/**
	 * The ids of the first and last rows shown, without a pass, if they changed
	 * since it last told them (D-253).
	 */
	endsMoved(): readonly string[] | undefined {
		const count = Math.min(this.#entries.length, this.first)
		const ends =
			count === 0
				? []
				: [this.#idAt(0), this.#idAt(count - 1)].flatMap((id) => id ?? [])
		if (ends[0] === this.#ends[0] && ends[1] === this.#ends[1]) return undefined
		this.#ends = ends
		return ends
	}

	hasMore(): boolean {
		return this.#entries.length > this.first
	}

	/** The ids of the entries, kept as they change. */
	ids(): Ids {
		return this.#keys
	}

	/** Where `keys` is or would go, the order being total. */
	#index(keys: Keys): number {
		const entries = this.#entries
		let low = 0
		let high = entries.length
		while (low < high) {
			const middle = (low + high) >> 1
			const at = entries[middle] ?? []
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
	fill(entries: readonly Keys[], rest: boolean): void {
		this.#entries.push(...entries)
		for (const keys of entries) {
			const id = this.#id(keys)
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
	place(keys: Keys): void {
		const id = this.#id(keys)
		const held = this.#keys.get(id)
		if (held !== undefined) keys[this.#sentAt] = held[this.#sentAt]
		this.remove(id)
		const entries = this.#entries
		const low = this.#index(keys)
		if (low === entries.length && this.rest) return
		this.#note(id, undefined)
		entries.splice(low, 0, keys)
		this.#keys.set(id, keys)
		const last = entries.length > this.first + 1 ? entries.pop() : undefined
		if (last !== undefined) {
			const out = this.#id(last)
			this.#note(out, last)
			this.#keys.delete(out)
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
		const after = (at: number, moved: boolean) => {
			const before = entries[at - 1]
			return {
				id: this.#idAt(at) ?? '',
				after: before === undefined ? null : this.#id(before),
				moved,
			}
		}
		const notes = this.#was
		if (notes === undefined) {
			return {
				removed: [],
				placed: this.shown().map((_, at) => after(at, true)),
			}
		}
		const extra = this.#idAt(this.first)
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
			const old = notes.get(id)
			// The rows whose keys stayed keep their order among themselves.
			const held =
				was(id) &&
				(old === undefined || compareKeys(old, keys, this.#orderBy) === 0)
			return held && !again.has(id)
				? []
				: [{ at: this.#index(keys), moved: !held }]
		})
		return {
			removed,
			placed: placed
				.toSorted((a, b) => a.at - b.at)
				.map(({ at, moved }) => after(at, moved)),
		}
	}
}
