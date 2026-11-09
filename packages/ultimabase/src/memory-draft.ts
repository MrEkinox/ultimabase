// The draft a memory() write changes: the store, changed in place and put
// back if the write fails (D-305), and what it changed for the feed (D-154).
import type {
	AggregateRead,
	Arithmetic,
	Change,
	Changed,
	CountRead,
	ListUpdate,
	Read,
	Row,
	ScalarType,
	Schema,
	SchemaField,
	Write,
} from './adapter.ts'
import { CheckFailed, OutOfRange, UniqueViolation } from './adapter.ts'
import type { Fields, Store, StoredRow } from './memory-read.ts'
import { Reader } from './memory-read.ts'
import { Journal } from './memory-journal.ts'
import { distinct, grouped } from './memory-aggregate.ts'
import { copy } from './memory-values.ts'
import { listed } from './list-update.ts'
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

/** A value as a unique key compares it: an object, a date too, as JSON. */
function normal(value: unknown, mode: string | undefined): unknown {
	if (value instanceof Object) return JSON.stringify(value)
	const lower = mode === 'insensitive' && typeof value === 'string'
	return lower ? value.toLowerCase() : value
}

export class Draft {
	readonly reader: Reader
	readonly schema: Schema
	/** What the write changed, in order, for the feed (D-154). */
	readonly changed: Changed[] = []
	readonly journal: Journal

	constructor(store: Store, fields: Fields, schema: Schema) {
		this.reader = new Reader(store, fields)
		this.schema = schema
		this.journal = new Journal(store)
	}

	find(read: Read): Row[] {
		const stored = this.reader.candidates(read.model, read.where)
		const rows = read.distinct ? distinct(this.reader, read, stored) : stored
		return this.reader
			.select(read.model, rows, read)
			.map((row) => this.reader.output(read.model, row, read))
	}

	count(read: CountRead): number {
		return this.selected(read).length
	}

	aggregate(read: AggregateRead): unknown[][] {
		return grouped(this.reader, read, this.selected(read))
	}

	private selected(read: CountRead): StoredRow[] {
		const rows = this.reader.candidates(read.model, read.where)
		return rows.filter(
			(row) => this.reader.matches(read.model, row, read.where) === true,
		)
	}

	/** Runs `write` whole, or leaves the store as it was and throws. */
	write(write: Write): Row[] {
		try {
			return this.written(write)
		} catch (error) {
			this.journal.undo()
			throw error
		}
	}

	private written(write: Write): Row[] {
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
		const from = this.changed.length
		this.reader.removed.clear()
		for (const [index, change] of changes.entries()) {
			if (change.kind === 'delete') {
				const removed = this.remove(change)
				this.reader.removed.set(index, new Set(removed.map(({ id }) => id)))
				this.note(this.deleted(change.model, removed))
			} else this.apply(change)
			this.reader.inverses.clear()
		}
		// The rows a write inserted or updated meet the others (D-347).
		const notes = Map.groupBy(this.changed.slice(from), ({ model }) => model)
		for (const [model, each] of notes) {
			const ids = each.flatMap((note) => ('ids' in note && note.ids) || [])
			this.checkUnique(model, new Set(ids))
		}
	}

	private note(change: Changed): void {
		const rows = 'field' in change ? change.pairs : change.ids
		if (rows?.length !== 0) this.changed.push(change)
	}

	private matching(model: string, change: Change): StoredRow[] {
		if (change.kind !== 'update' && change.kind !== 'delete') return []
		return this.reader
			.candidates(model, change.where)
			.filter((row) => this.reader.matches(model, row, change.where) === true)
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

	/** The numbers and lists a change computes on `row` (D-132, D-149). */
	private computed(
		model: string,
		row: StoredRow,
		compute: { readonly [field: string]: Arithmetic | ListUpdate } = {},
	): { [field: string]: unknown } {
		return Object.fromEntries(
			Object.entries(compute).map(([key, operation]): [string, unknown] => {
				if ('elements' in operation) return [key, listed(row[key], operation)]
				const field = this.reader.field(model, key)
				const integer = field?.kind === 'scalar' && field.integer === true
				const result = computed(row[key], operation, integer)
				if (integer ? !isInteger(result) : !Number.isFinite(result)) {
					throw new OutOfRange(model, key)
				}
				return [key, result]
			}),
		)
	}

	/** The feed's delete of `rows`, with the `one` keys they stored (D-196). */
	private deleted(model: string, rows: readonly StoredRow[]): Changed {
		const ids = rows.map(({ id }) => id)
		const keys = [...(this.reader.fields.get(model)?.values() ?? [])]
			.filter((field) => field.kind === 'one' && field.stored)
			.map(({ name }) => {
				const values = rows.map((row) => row[name])
				return [
					name,
					values.map((key) => (typeof key === 'string' ? key : null)),
				] as const
			})
		if (keys.length === 0) return { kind: 'delete', model, ids }
		return { kind: 'delete', model, ids, keys: Object.fromEntries(keys) }
	}

	/** Applies `delete`; returns the rows it removed. */
	private remove(change: Extract<Change, { kind: 'delete' }>): StoredRow[] {
		const table = this.journal.table(change.model)
		const removed: StoredRow[] = []
		for (const row of this.matching(change.model, change)) {
			removed.push(row)
			this.journal.delete(table, row.id)
			for (const field of this.joinFields(change.model)) {
				this.unlink(change.model, field, row.id, [
					...(this.side(change.model, field.name).get(row.id) ?? []),
				])
			}
		}
		return removed
	}

	private apply(change: Exclude<Change, { kind: 'delete' }>): void {
		const table = this.journal.table(change.model)
		switch (change.kind) {
			case 'insert': {
				if (table.has(change.row.id)) {
					throw new UniqueViolation(change.model, ['id'])
				}
				this.journal.set(table, {
					...this.stored(change.model, change.row),
					id: change.row.id,
				})
				this.note({ kind: 'insert', model: change.model, ids: [change.row.id] })
				return
			}
			case 'update': {
				const rows = this.matching(change.model, change)
				for (const row of rows) {
					const set = {
						...change.set,
						...this.computed(change.model, row, change.compute),
					}
					this.journal.set(table, {
						...row,
						...this.stored(change.model, set),
						id: row.id,
					})
				}
				const fields = [
					...Object.keys(change.set),
					...Object.keys(change.compute ?? {}),
				]
				const ids = rows.map((row) => row.id)
				this.note({ kind: 'update', model: change.model, ids, fields })
				return
			}
			case 'link':
			case 'unlink': {
				const field = this.reader.field(change.model, change.field)
				if (field?.kind !== 'many' || !field.join) {
					throw new Error(`${change.model}.${change.field} has no join.`)
				}
				const { model, id } = change
				const targets =
					change.kind === 'unlink'
						? this.unlink(model, field, id, change.targets)
						: change.targets.filter((target) =>
								this.link(model, field, id, target),
							)
				const pairs = targets.map((target): [string, string] => [id, target])
				this.note({ kind: change.kind, model, field: field.name, pairs })
				return
			}
		}
	}

	private joinFields(model: string): SchemaField[] {
		return [...(this.reader.fields.get(model)?.values() ?? [])].filter(
			(field) =>
				field.kind === 'many' && field.join && field.from === undefined,
		)
	}

	private side(model: string, field: string): Map<string, Set<string>> {
		return this.journal.side(`${model}.${field}`)
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

	/** Links `id` to `target` unless they were; tells whether it did. */
	private link(
		model: string,
		field: Extract<SchemaField, { kind: 'many' }>,
		id: string,
		target: string,
	): boolean {
		const ids = this.ids(model, field.name, id)
		if (ids.has(target)) return false
		this.journal.add(ids, target)
		this.journal.add(this.ids(field.target, field.inverse, target), id)
		return true
	}

	/** Unlinks `id` from `targets`; returns the targets it was linked to. */
	private unlink(
		model: string,
		field: SchemaField,
		id: string,
		targets: readonly string[],
	): string[] {
		if (field.kind !== 'many') return []
		return targets.filter((target) => {
			const ids = this.side(model, field.name).get(id)
			const removed = ids !== undefined && this.journal.remove(ids, target)
			const other = this.side(field.target, field.inverse).get(target)
			if (other !== undefined) this.journal.remove(other, id)
			return removed
		})
	}

	/**
	 * The unique fields, indexes and one-to-one keys of the rows `ids` names,
	 * against the others; `null` never clashes. A case-insensitive index
	 * lowers its strings (D-170); a partial one keeps the rows it selects (D-215).
	 */
	private checkUnique(model: string, ids: ReadonlySet<string>): void {
		const definition = this.schema.models.find((each) => each.name === model)
		if (definition === undefined) return
		const sets = [
			...definition.indexes.filter((index) => index.unique),
			...definition.fields.flatMap((field) =>
				field.kind !== 'many' && field.unique
					? [{ fields: [field.name], mode: undefined, where: undefined }]
					: [],
			),
		]
		const table = this.reader.table(model)
		const written = [...ids].flatMap((id) => table.get(id) ?? [])
		for (const { fields, mode, where } of sets) {
			const kept = (row: StoredRow) =>
				where === undefined || this.reader.matches(model, row, where) === true
			const values = (row: StoredRow) =>
				fields.map((field) => normal(row[field] ?? null, mode))
			const keys = new Set<string>()
			const firsts = new Set<unknown>()
			for (const row of written.filter(kept)) {
				const found = values(row)
				if (found.includes(null)) continue
				const key = JSON.stringify(found)
				if (keys.has(key)) throw new UniqueViolation(model, fields)
				keys.add(key)
				firsts.add(found[0])
			}
			const [first = 'id'] = fields
			for (const row of firsts.size === 0 ? [] : table.values()) {
				if (ids.has(row.id) || !firsts.has(normal(row[first] ?? null, mode)))
					continue
				if (kept(row) && keys.has(JSON.stringify(values(row)))) {
					throw new UniqueViolation(model, fields)
				}
			}
		}
	}
}
