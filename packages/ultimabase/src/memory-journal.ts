// How a memory() write changes the rows in place and undoes itself when it
// fails, and how a transaction copies a table the first time it changes it
// (D-305): a write costs what it changes, not every row of the store.
import type { Store, StoredRow } from './memory-read.ts'
import { modelOf } from './query-where.ts'

/**
 * A transaction's store: it shares each table and join with the store it began
 * from until it changes it, then changes its own copy.
 */
export function layer(store: Store): Store {
	return {
		tables: new Map(store.tables),
		joins: new Map(store.joins),
		copied: new Set(),
	}
}

export class Journal {
	readonly #store: Store
	readonly #undo: (() => void)[] = []
	/** The tables and links saved whole before their first removal. */
	readonly #kept = new Set<Map<string, StoredRow> | Set<string>>()

	constructor(store: Store) {
		this.#store = store
	}

	/** The rows of `model`, to change. */
	table(model: string): Map<string, StoredRow> {
		const { tables, copied } = this.#store
		const table = modelOf(tables, model)
		if (copied === undefined || copied.has(model)) return table
		const own = new Map(table)
		tables.set(model, own)
		copied.add(model)
		return own
	}

	/** The links of `name`, `Model.field`, to change. */
	side(name: string): Map<string, Set<string>> {
		const { joins, copied } = this.#store
		const side = joins.get(name)
		if (side !== undefined && (copied === undefined || copied.has(name))) {
			return side
		}
		const own = new Map(
			[...(side ?? [])].map(([id, ids]) => [id, new Set(ids)] as const),
		)
		joins.set(name, own)
		copied?.add(name)
		return own
	}

	set(table: Map<string, StoredRow>, row: StoredRow): void {
		const before = table.get(row.id)
		table.set(row.id, row)
		this.#undo.push(
			before === undefined
				? () => table.delete(row.id)
				: () => table.set(row.id, before),
		)
	}

	delete(table: Map<string, StoredRow>, id: string): void {
		this.#keep(table)
		table.delete(id)
	}

	/** Adds `id` to `ids` unless it is there. */
	add(ids: Set<string>, id: string): void {
		if (ids.has(id)) return
		ids.add(id)
		this.#undo.push(() => ids.delete(id))
	}

	/** Removes `id` from `ids`; tells whether it was there. */
	remove(ids: Set<string>, id: string): boolean {
		if (!ids.has(id)) return false
		this.#keep(ids)
		ids.delete(id)
		return true
	}

	/** Puts back what the write changed, in its order, as it was. */
	undo(): void {
		for (const step of this.#undo.toReversed()) step()
		this.#undo.length = 0
	}

	/** An item put back would move to the end: the first removal saves all. */
	#keep(items: Map<string, StoredRow> | Set<string>): void {
		if (this.#kept.has(items)) return
		this.#kept.add(items)
		if (items instanceof Set) {
			const before = [...items]
			this.#undo.push(() => {
				items.clear()
				for (const id of before) items.add(id)
			})
			return
		}
		const before = [...items]
		this.#undo.push(() => {
			items.clear()
			for (const [id, row] of before) items.set(id, row)
		})
	}
}
