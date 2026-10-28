// `memory()`: the in-memory adapter, for tests and examples (D-02). Each write
// runs on a copy of the store that replaces it once whole, so a failed write
// changes nothing; a transaction holds the write lock until it ends.
import type {
	Adapter,
	AggregateRead,
	Arithmetic,
	Change,
	CountRead,
	Read,
	Row,
	ScalarType,
	Schema,
	SchemaField,
	Transaction,
	Write,
} from './adapter.ts'
import { CheckFailed, OutOfRange, UniqueViolation } from './adapter.ts'
import type { Fields, Store, StoredRow } from './memory-read.ts'
import { clone, Reader } from './memory-read.ts'
import { aggregated } from './memory-aggregate.ts'
import { copy } from './memory-values.ts'
import { computed } from './number-update.ts'
import { isInteger } from './query-where.ts'

/**
 * A value as PostgreSQL gives it back: `-0` is `0`, which `pg` sends for a
 * number, and JSON text for json (D-94).
 */
function storedAs(type: ScalarType | undefined, value: unknown): unknown {
	if (type === 'json') {
		const parsed: unknown = JSON.parse(JSON.stringify(value))
		return parsed
	}
	if (type === 'number' && value === 0) return 0
	return copy(value)
}

function keyOf(values: readonly unknown[]): string {
	return JSON.stringify(
		values.map((value) =>
			value instanceof Date ? `date:${value.getTime()}` : value,
		),
	)
}

class Draft {
	readonly reader: Reader
	readonly schema: Schema

	constructor(store: Store, fields: Fields, schema: Schema) {
		this.reader = new Reader(store, fields)
		this.schema = schema
	}

	find(read: Read): Row[] {
		const rows = [...this.reader.table(read.model).values()]
		return this.reader
			.select(read.model, rows, read)
			.map((row) => this.reader.output(read.model, row, read))
	}

	count(read: CountRead): number {
		return this.selected(read).length
	}

	aggregate(read: AggregateRead): unknown[] {
		return aggregated(this.selected(read), read.aggregates)
	}

	private selected(read: CountRead): StoredRow[] {
		const rows = [...this.reader.table(read.model).values()]
		return rows.filter(
			(row) => this.reader.matches(read.model, row, read.where) === true,
		)
	}

	write(write: Write): Row[] {
		for (const [index, check] of (write.checks ?? []).entries()) {
			if (this.count(check) !== check.count) throw new CheckFailed(index)
		}
		const read = write.read
		if (read !== undefined && write.before === true) {
			const { model } = read
			const deletes = write.changes.some(
				(change) => change.kind === 'delete' && change.model === model,
			)
			const update = write.changes.find(
				(change) => change.kind === 'update' && change.model === model,
			)
			if (!deletes) {
				// The rows its update changed, as it left them (D-133).
				const changed = update && this.matching(model, update)
				const ids = new Set(changed?.map((row) => row.id))
				this.change(write.changes)
				return this.find(read).filter((row) => ids.has(row.id))
			}
			const rows = this.find(read)
			this.change(write.changes)
			// The rows the write's delete removed, as they were (D-104).
			const table = this.reader.table(read.model)
			return rows.filter((row) => !table.has(row.id))
		}
		this.change(write.changes)
		return read === undefined ? [] : this.find(read)
	}

	private change(changes: readonly Change[]): void {
		const touched = new Set<string>()
		this.reader.removed.clear()
		for (const [index, change] of changes.entries()) {
			touched.add(change.model)
			if (change.kind === 'delete') {
				this.reader.removed.set(index, this.remove(change))
			} else this.apply(change)
		}
		for (const model of touched) this.checkUnique(model)
	}

	private matching(model: string, change: Change): StoredRow[] {
		if (change.kind !== 'update' && change.kind !== 'delete') return []
		return [...this.reader.table(model).values()].filter(
			(row) => this.reader.matches(model, row, change.where) === true,
		)
	}

	private stored(
		model: string,
		value: { readonly [field: string]: unknown },
	): { [field: string]: unknown } {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => {
				const field = this.reader.field(model, key)
				const type = field?.kind === 'scalar' ? field.type : undefined
				return [key, storedAs(type, item)]
			}),
		)
	}

	/** The numbers a change computes on `row` (D-132). */
	private computed(
		model: string,
		row: StoredRow,
		compute: { readonly [field: string]: Arithmetic } = {},
	): { [field: string]: number } {
		return Object.fromEntries(
			Object.entries(compute).map(([key, arithmetic]) => {
				const field = this.reader.field(model, key)
				const integer = field?.kind === 'scalar' && field.integer === true
				const result = computed(row[key], arithmetic, integer)
				if (integer ? !isInteger(result) : !Number.isFinite(result)) {
					throw new OutOfRange(model, key)
				}
				return [key, result]
			}),
		)
	}

	/** Applies `delete`; returns the ids it removed. */
	private remove(change: Extract<Change, { kind: 'delete' }>): Set<string> {
		const table = this.reader.table(change.model)
		const removed = new Set<string>()
		for (const row of this.matching(change.model, change)) {
			removed.add(row.id)
			table.delete(row.id)
			for (const field of this.joinFields(change.model)) {
				this.unlink(change.model, field, row.id, [
					...(this.side(change.model, field.name).get(row.id) ?? []),
				])
			}
		}
		return removed
	}

	private apply(change: Exclude<Change, { kind: 'delete' }>): void {
		const table = this.reader.table(change.model)
		switch (change.kind) {
			case 'insert': {
				if (table.has(change.row.id)) {
					throw new UniqueViolation(change.model, ['id'])
				}
				table.set(change.row.id, {
					...this.stored(change.model, change.row),
					id: change.row.id,
				})
				return
			}
			case 'update': {
				for (const row of this.matching(change.model, change)) {
					const set = {
						...change.set,
						...this.computed(change.model, row, change.compute),
					}
					table.set(row.id, {
						...row,
						...this.stored(change.model, set),
						id: row.id,
					})
				}
				return
			}
			case 'link':
			case 'unlink': {
				const field = this.reader.field(change.model, change.field)
				if (field?.kind !== 'many' || !field.join) {
					throw new Error(`${change.model}.${change.field} has no join.`)
				}
				if (change.kind === 'unlink') {
					this.unlink(change.model, field, change.id, change.targets)
					return
				}
				for (const target of change.targets) {
					this.ids(change.model, field.name, change.id).add(target)
					this.ids(field.target, field.inverse, target).add(change.id)
				}
				return
			}
		}
	}

	private joinFields(model: string): SchemaField[] {
		return [...(this.reader.fields.get(model)?.values() ?? [])].filter(
			(field) => field.kind === 'many' && field.join,
		)
	}

	private side(model: string, field: string): Map<string, Set<string>> {
		const name = `${model}.${field}`
		let side = this.reader.store.joins.get(name)
		if (side === undefined) {
			side = new Map()
			this.reader.store.joins.set(name, side)
		}
		return side
	}

	private ids(model: string, field: string, id: string): Set<string> {
		const side = this.side(model, field)
		let ids = side.get(id)
		if (ids === undefined) {
			ids = new Set()
			side.set(id, ids)
		}
		return ids
	}

	private unlink(
		model: string,
		field: SchemaField,
		id: string,
		targets: readonly string[],
	): void {
		if (field.kind !== 'many') return
		for (const target of targets) {
			this.side(model, field.name).get(id)?.delete(target)
			this.side(field.target, field.inverse).get(target)?.delete(id)
		}
	}

	/** Unique fields, unique indexes and one-to-one keys; `null` never clashes. */
	private checkUnique(model: string): void {
		const definition = this.schema.models.find((each) => each.name === model)
		if (definition === undefined) return
		const sets: (readonly string[])[] = definition.indexes
			.filter((index) => index.unique)
			.map((index) => index.fields)
		for (const field of definition.fields) {
			if (field.kind !== 'many' && field.unique) sets.push([field.name])
		}
		const rows = [...this.reader.table(model).values()]
		for (const fields of sets) {
			const seen = new Set<string>()
			for (const row of rows) {
				const values = fields.map((field) => row[field] ?? null)
				if (values.includes(null)) continue
				const found = keyOf(values)
				if (seen.has(found)) throw new UniqueViolation(model, fields)
				seen.add(found)
			}
		}
	}
}

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

/** The in-memory adapter (D-02); its state lives as long as the value. */
export function memory(): Adapter {
	let schema: Schema | undefined
	let fields: Fields = new Map()
	let store: Store = { tables: new Map(), joins: new Map() }
	let lock: Promise<void> = Promise.resolve()

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
		start: async (started) => {
			schema = started
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
				const rows = draft(next).write(write)
				store = next
				return rows
			} finally {
				release()
			}
		},
		begin: async (): Promise<Transaction> => {
			const release = await acquire()
			const next = clone(store)
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
					const rows = draft(attempt).write(write)
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
