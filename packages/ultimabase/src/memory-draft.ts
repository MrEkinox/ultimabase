// The draft a memory() write changes: a copy of the store, and what the
// write changed for the feed (D-154).
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

function keyOf(values: readonly unknown[]): string {
	return JSON.stringify(
		values.map((value) =>
			value instanceof Date ? `date:${value.getTime()}` : value,
		),
	)
}

export class Draft {
	readonly reader: Reader
	readonly schema: Schema
	/** What the write changed, in order, for the feed (D-154). */
	readonly changed: Changed[] = []

	constructor(store: Store, fields: Fields, schema: Schema) {
		this.reader = new Reader(store, fields)
		this.schema = schema
	}

	find(read: Read): Row[] {
		const stored = [...this.reader.table(read.model).values()]
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
				const removed = this.remove(change)
				this.reader.removed.set(index, removed)
				this.note({ kind: 'delete', model: change.model, ids: [...removed] })
			} else this.apply(change)
		}
		for (const model of touched) this.checkUnique(model)
	}

	private note(change: Changed): void {
		const rows = 'field' in change ? change.pairs : change.ids
		if (rows?.length !== 0) this.changed.push(change)
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
					table.set(row.id, {
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

	/** Links `id` to `target` unless they were; tells whether it did. */
	private link(
		model: string,
		field: Extract<SchemaField, { kind: 'many' }>,
		id: string,
		target: string,
	): boolean {
		const ids = this.ids(model, field.name, id)
		if (ids.has(target)) return false
		ids.add(target)
		this.ids(field.target, field.inverse, target).add(id)
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
			const removed = this.side(model, field.name).get(id)?.delete(target)
			this.side(field.target, field.inverse).get(target)?.delete(id)
			return removed === true
		})
	}

	/**
	 * Unique fields, unique indexes and one-to-one keys; `null` never clashes.
	 * A case-insensitive index compares its strings lowered (D-170).
	 */
	private checkUnique(model: string): void {
		const definition = this.schema.models.find((each) => each.name === model)
		if (definition === undefined) return
		const sets = definition.indexes
			.filter((index) => index.unique)
			.map(({ fields, mode }) => ({ fields, lower: mode === 'insensitive' }))
		for (const field of definition.fields) {
			if (field.kind !== 'many' && field.unique) {
				sets.push({ fields: [field.name], lower: false })
			}
		}
		const rows = [...this.reader.table(model).values()]
		for (const { fields, lower } of sets) {
			const seen = new Set<string>()
			for (const row of rows) {
				const values = fields.map((field) => {
					const value = row[field] ?? null
					return lower && typeof value === 'string'
						? value.toLowerCase()
						: value
				})
				if (values.includes(null)) continue
				const found = keyOf(values)
				if (seen.has(found)) throw new UniqueViolation(model, fields)
				seen.add(found)
			}
		}
	}
}
