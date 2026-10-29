// `memory()`: the in-memory adapter, for tests and examples (D-02). Each write
// runs on a copy of the store that replaces it once whole, so a failed write
// changes nothing; a transaction holds the write lock until it ends.
import type { Adapter, Changed, Feed, Schema, Transaction } from './adapter.ts'
import { feedFields, feedIds } from './adapter.ts'
import { Draft } from './memory-draft.ts'
import type { Fields, Store, StoredRow } from './memory-read.ts'
import { clone } from './memory-read.ts'

/** The reads of the draft `get` gives, each a tick later, as a database's. */
function readsOf(
	get: () => Draft,
): Pick<Transaction, 'find' | 'count' | 'aggregate'> {
	const later = async <R>(read: (draft: Draft) => R): Promise<R> => {
		await Promise.resolve()
		return read(get())
	}
	return {
		find: async (read) => later((draft) => draft.find(read)),
		count: async (read) => later((draft) => draft.count(read)),
		aggregate: async (read) => later((draft) => draft.aggregate(read)),
	}
}

/**
 * `changes` as the feed gives them: one entry for the same rows' changes,
 * without the lists past its limits (D-154).
 */
function fed(changes: readonly Changed[]): Changed[] {
	type Entry = {
		readonly change: Changed
		readonly ids: string[]
		readonly pairs: (readonly [string, string])[]
	}
	const entries = new Map<string, Entry>()
	for (const change of changes) {
		const linked = 'field' in change
		const key = JSON.stringify([
			change.kind,
			change.model,
			linked ? change.field : change.fields,
		])
		const entry = entries.get(key) ?? { change, ids: [], pairs: [] }
		if (linked) entry.pairs.push(...(change.pairs ?? []))
		else entry.ids.push(...(change.ids ?? []))
		entries.set(key, entry)
	}
	return [...entries.values()].map(({ change, ids, pairs }): Changed => {
		if ('field' in change) {
			const { kind, model, field } = change
			const listed = pairs.length > feedIds ? {} : { pairs }
			return { kind, model, field, ...listed }
		}
		const { kind, model, fields } = change
		const listed = ids.length > feedIds ? {} : { ids }
		const some =
			fields !== undefined && JSON.stringify(fields).length <= feedFields
		return { kind, model, ...listed, ...(some ? { fields } : {}) }
	})
}

/** The in-memory adapter (D-02); its state lives as long as the value. */
export function memory(): Adapter {
	let schema: Schema | undefined
	let fields: Fields = new Map()
	let store: Store = { tables: new Map(), joins: new Map() }
	let lock: Promise<void> = Promise.resolve()
	let feed: Feed | undefined

	// After the commit, as a database's notifications come.
	const deliver = (changes: readonly Changed[]): void => {
		const to = feed
		if (to === undefined || changes.length === 0) return
		setImmediate(() => to.changed(fed(changes)))
	}

	const draft = (from: Store): Draft => {
		if (schema === undefined) throw new Error('memory() is not started.')
		return new Draft(from, fields, schema)
	}
	// Writes queue behind each other and behind an open transaction.
	const acquire = async (): Promise<() => void> => {
		const previous = lock
		const { promise, resolve } = Promise.withResolvers<void>()
		lock = promise
		await previous
		return resolve
	}

	return {
		start: async (started, _logger, given) => {
			schema = started
			feed = given
			fields = new Map(
				started.models.map((model) => [
					model.name,
					new Map(model.fields.map((field) => [field.name, field])),
				]),
			)
			store = {
				tables: new Map(
					started.models.map((model) => [
						model.name,
						new Map<string, StoredRow>(),
					]),
				),
				joins: new Map(),
			}
			await Promise.resolve()
		},
		stop: async () => {
			await lock
		},
		...readsOf(() => draft(store)),
		write: async (write) => {
			const release = await acquire()
			try {
				const next = clone(store)
				const writing = draft(next)
				const rows = writing.write(write)
				store = next
				deliver(writing.changed)
				return rows
			} finally {
				release()
			}
		},
		begin: async (): Promise<Transaction> => {
			const release = await acquire()
			const next = clone(store)
			const changed: Changed[] = []
			let open = true
			const active = (): Draft => {
				if (!open) throw new Error('The transaction has ended.')
				return draft(next)
			}
			const end = (): void => {
				open = false
				release()
			}
			return {
				...readsOf(active),
				write: async (write) => {
					await Promise.resolve()
					active()
					// A failed write leaves the transaction as it was.
					const attempt = clone(next)
					const writing = draft(attempt)
					const rows = writing.write(write)
					changed.push(...writing.changed)
					next.tables.clear()
					next.joins.clear()
					for (const [name, table] of attempt.tables)
						next.tables.set(name, table)
					for (const [name, side] of attempt.joins) next.joins.set(name, side)
					return rows
				},
				commit: async () => {
					active()
					store = next
					end()
					deliver(changed)
					await Promise.resolve()
				},
				rollback: async () => {
					active()
					end()
					await Promise.resolve()
				},
			}
		},
	}
}
