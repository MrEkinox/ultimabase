// `memory()`: the in-memory adapter, for tests and examples (D-02). Each write
// runs on a copy of the store that replaces it once whole, so a failed write
// changes nothing; a transaction holds the write lock until it ends.
import type {
	Adapter,
	Change,
	CountRead,
	Read,
	Row,
	Schema,
	SchemaField,
	Transaction,
	Write,
} from './adapter.ts'
import { CheckFailed, UniqueViolation } from './adapter.ts'
import type { Fields, Store, StoredRow } from './memory-read.ts'
import { copy, Reader } from './memory-read.ts'

function clone(store: Store): Store {
	return {
		tables: new Map(
			[...store.tables].map(([name, table]) => [name, new Map(table)]),
		),
		joins: new Map(
			[...store.joins].map(([key, side]) => [
				key,
				new Map([...side].map(([id, ids]) => [id, new Set(ids)])),
			]),
		),
	}
}

function stored(value: { readonly [field: string]: unknown }): {
	[field: string]: unknown
} {
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, copy(item)]),
	)
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
		const rows = [...this.reader.table(read.model).values()]
		return rows.filter(
			(row) => this.reader.matches(read.model, row, read.where) === true,
		).length
	}

	write(write: Write): Row[] {
		for (const [index, check] of (write.checks ?? []).entries()) {
			if (this.count(check) !== check.count) throw new CheckFailed(index)
		}
		const touched = new Set<string>()
		for (const change of write.changes) {
			touched.add(change.model)
			this.apply(change)
		}
		for (const model of touched) this.checkUnique(model)
		return write.read === undefined ? [] : this.find(write.read)
	}

	private matching(model: string, change: Change): StoredRow[] {
		if (change.kind !== 'update' && change.kind !== 'delete') return []
		return [...this.reader.table(model).values()].filter(
			(row) => this.reader.matches(model, row, change.where) === true,
		)
	}

	private apply(change: Change): void {
		const table = this.reader.table(change.model)
		switch (change.kind) {
			case 'insert': {
				if (table.has(change.row.id)) {
					throw new UniqueViolation(change.model, ['id'])
				}
				table.set(change.row.id, { ...stored(change.row), id: change.row.id })
				return
			}
			case 'update': {
				for (const row of this.matching(change.model, change)) {
					table.set(row.id, { ...row, ...stored(change.set), id: row.id })
				}
				return
			}
			case 'delete': {
				for (const row of this.matching(change.model, change)) {
					table.delete(row.id)
					for (const field of this.joinFields(change.model)) {
						this.unlink(change.model, field, row.id, [
							...(this.side(change.model, field.name).get(row.id) ?? []),
						])
					}
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
		find: async (read) => {
			await Promise.resolve()
			return draft(store).find(read)
		},
		count: async (read) => {
			await Promise.resolve()
			return draft(store).count(read)
		},
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
				find: async (read) => {
					await Promise.resolve()
					return active().find(read)
				},
				count: async (read) => {
					await Promise.resolve()
					return active().count(read)
				},
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
