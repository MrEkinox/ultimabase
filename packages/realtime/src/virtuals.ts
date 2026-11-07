// The reads a live read's virtual fields made: the rows read together share
// theirs, and a write that may change one reads those rows again; only the
// rows that read differently are sent again.
import { hash } from 'node:crypto'
import type { Row } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import type { Loader } from './loader.ts'
import { anyStale, mayBeStale } from './stale.ts'

type Group = { readonly reads: readonly Recorded[]; readonly ids: Set<string> }

const printOf = (node: Row): string =>
	hash('sha1', JSON.stringify(node), 'base64')

export class VirtualReads {
	readonly #groups = new Set<Group>()
	readonly #of = new Map<string, Group>()
	/** What each row read with virtuals was, to tell when it changes. */
	readonly #prints = new Map<string, string>()
	#fresh = new Map<string, Row>()

	/** Whether it holds reads, which no route describes (D-256). */
	get holding(): boolean {
		return this.#groups.size > 0
	}

	clear(): void {
		this.#groups.clear()
		this.#of.clear()
		this.#prints.clear()
		this.#fresh.clear()
	}

	/** Keeps `reads` as what the virtuals of `nodes` read. */
	keep(nodes: readonly Row[], reads: readonly Recorded[]): void {
		for (const { id } of nodes) this.forget(id)
		if (reads.length === 0 || nodes.length === 0) return
		const group = { reads, ids: new Set(nodes.map(({ id }) => id)) }
		this.#groups.add(group)
		for (const node of nodes) {
			this.#of.set(node.id, group)
			this.#prints.set(node.id, printOf(node))
		}
	}

	/** Forgets what the virtuals of the row `id` read. */
	forget(id: string): void {
		const group = this.#of.get(id)
		if (group === undefined) return
		this.#of.delete(id)
		this.#prints.delete(id)
		group.ids.delete(id)
		if (group.ids.size === 0) this.#groups.delete(group)
	}

	/** Whether `batch` wrote a model one of its reads depends on. */
	mayChange(batch: Batch): boolean {
		for (const { reads } of this.#groups) {
			if (mayBeStale(reads, batch)) return true
		}
		return false
	}

	/**
	 * Reads again, through `read`, the rows whose virtuals read what a write
	 * in `batch` may change; returns those that now read differently, whose
	 * nodes `taken` then gives.
	 */
	async changed(
		batch: Batch,
		loader: Loader,
		read: (ids: readonly string[]) => Promise<ReadonlyMap<string, Row>>,
	): Promise<ReadonlySet<string>> {
		const stale: string[] = []
		for (const group of this.#groups) {
			if (await anyStale(group.reads, batch, loader)) stale.push(...group.ids)
		}
		if (stale.length === 0) return new Set()
		const before = new Map(stale.map((id) => [id, this.#prints.get(id)]))
		const nodes = await read(stale)
		for (const [id, node] of nodes) {
			if (before.get(id) !== this.#prints.get(id)) this.#fresh.set(id, node)
		}
		return new Set(this.#fresh.keys())
	}

	/** The rows `changed` read again, which a send then needs not read. */
	taken(): Map<string, Row> {
		const fresh = this.#fresh
		this.#fresh = new Map()
		return fresh
	}
}
