// The reads a caller's construction makes (D-154): `identify`, the plugins'
// `caller` and `beforeFind` run inside `recording`, which keeps what each
// read reached, so a write to one of them rebuilds the caller, and the
// earliest time a plugin said the caller stops holding.
import { AsyncLocalStorage } from 'node:async_hooks'
import type {
	AggregateRead,
	CountRead,
	Filter,
	GroupKey,
	Nested,
	Read,
	Row,
	Step,
} from './adapter.ts'
import type { Models } from './query-where.ts'
import { modelOf } from './query-where.ts'

/** What one read reached. */
export type Recorded = {
	readonly model: string
	/** Absent, the read reached every row of the model. */
	readonly where?: Filter
	/** The rows it found; absent for a count, or rows it did not list. */
	readonly ids?: readonly string[]
	/** The relation, as `Model.field`, it followed from another read's rows. */
	readonly relation?: string
	/** The fields it returned or aggregated; absent, every field. */
	readonly fields?: readonly string[]
	/**
	 * The fields that chose and ordered its rows: its filter's, sort's and
	 * keys'; absent, it may depend on any field.
	 */
	readonly filters?: readonly string[]
}

type Recording = { readonly reads: Recorded[]; expires: number | undefined }

const recorder = new AsyncLocalStorage<Recording>()

/** Runs `run`, keeping each read the kernel makes until it settles. */
export async function recording<R>(run: () => Promise<R>): Promise<{
	readonly result: R
	readonly reads: readonly Recorded[]
	readonly expires?: Date
}> {
	const kept: Recording = { reads: [], expires: undefined }
	const result = await recorder.run(kept, run)
	const { reads, expires } = kept
	return {
		result,
		reads: [...reads],
		...(expires !== undefined && { expires: new Date(expires) }),
	}
}

/** Keeps `at` when it is the earliest expiry, if a recording runs. */
export function recordExpiry(at: Date): void {
	const time = at.getTime()
	if (Number.isNaN(time)) throw new TypeError('expires takes a valid date.')
	const kept = recorder.getStore()
	if (kept === undefined) return
	if (kept.expires === undefined || time < kept.expires) kept.expires = time
}

/** The ids of `rows`, each once: included rows repeat a shared one. */
const idsOf = (rows: readonly unknown[]): string[] => [
	...new Set(
		rows.flatMap((row) => {
			const id: unknown = Reflect.get(Object(row), 'id')
			return typeof id === 'string' ? [id] : []
		}),
	),
]

/** Adds the fields `where` tests on its rows; false when it tests a text search. */
function filtered(where: Filter | undefined, into: Set<string>): boolean {
	if (where === undefined) return true
	for (const key of Object.keys(where)) {
		if (key === '_search') return false
		if (key !== 'AND' && key !== 'OR' && key !== 'NOT') into.add(key)
	}
	const nested = [
		...(where.AND ?? []),
		...(where.OR ?? []),
		...(where.NOT ?? []),
	]
	return nested.every((filter) => filtered(filter, into))
}

/** A sort's or a key's field on the row: the relation it goes through first. */
const ownField = (key: GroupKey): string =>
	key.through?.[0]?.relation ?? key.field

/** The fields a read returned and the ones that chose its rows. */
function dependsOn(
	read: Nested & { readonly distinct?: readonly GroupKey[] },
): Pick<Recorded, 'fields' | 'filters'> {
	const filters = new Set<string>()
	// A sort by relevance comes with a text search, which `filtered` refuses.
	const known = filtered(read.where, filters) && filtered(read.cursor, filters)
	for (const order of read.orderBy ?? []) filters.add(ownField(order))
	for (const key of read.distinct ?? []) filters.add(ownField(key))
	filters.delete('id')
	return {
		...(read.fields && { fields: read.fields }),
		...(known && { filters: [...filters] }),
	}
}

/** Keeps the relation `name` of `model` follows, and returns its target. */
function follow(
	models: Models,
	reads: Recorded[],
	model: string,
	name: string,
	reached: Omit<Recorded, 'model' | 'relation'> = {},
): string | undefined {
	const field = modelOf(models, model).fields.get(name)
	if (field === undefined || field.kind === 'scalar') return undefined
	reads.push({ model: field.target, ...reached, relation: `${model}.${name}` })
	return field.target
}

/** Keeps the `one` relations `steps` go through from `model`. */
function through(
	models: Models,
	reads: Recorded[],
	model: string,
	steps: readonly Step[] = [],
): string | undefined {
	let on: string | undefined = model
	for (const { relation, where } of steps) {
		if (on === undefined) return undefined
		on = follow(models, reads, on, relation, where && { where })
	}
	return on
}

/** The relations `read` follows from `model`'s rows found as `rows`. */
function followed(
	models: Models,
	reads: Recorded[],
	model: string,
	read: Nested,
	rows: readonly unknown[],
): void {
	for (const order of read.orderBy ?? []) {
		const on = through(models, reads, model, order.through)
		if (on !== undefined && order.count !== undefined) {
			follow(models, reads, on, order.field, { where: order.count })
		}
	}
	for (const [name, where] of Object.entries(read.count ?? {})) {
		follow(models, reads, model, name, { where })
	}
	for (const [name, nested] of Object.entries(read.include ?? {})) {
		const found = rows.flatMap((row): unknown[] => {
			const value: unknown = Reflect.get(Object(row), name)
			if (Array.isArray(value)) return value
			return value === null || value === undefined ? [] : [value]
		})
		const target = follow(models, reads, model, name, {
			...(nested.where && { where: nested.where }),
			ids: idsOf(found),
			...dependsOn(nested),
		})
		if (target !== undefined) followed(models, reads, target, nested, found)
	}
}

/** Keeps a find, if a recording runs. */
export function recordFind(
	models: Models,
	read: Read,
	rows: readonly Row[],
): void {
	const reads = recorder.getStore()?.reads
	if (reads === undefined) return
	const { model, where } = read
	reads.push({
		model,
		...(where && { where }),
		ids: idsOf(rows),
		...dependsOn(read),
	})
	followed(models, reads, model, read, rows)
}

/** Keeps a count or an aggregate, if a recording runs. */
export function recordCount(
	models: Models,
	read: CountRead | AggregateRead,
): void {
	const reads = recorder.getStore()?.reads
	if (reads === undefined) return
	const { model, where } = read
	const filters = new Set<string>()
	const known = filtered(where, filters)
	const by = 'by' in read ? (read.by ?? []) : []
	for (const key of by) filters.add(ownField(key))
	const aggregates = 'aggregates' in read ? read.aggregates : []
	const fields = aggregates.flatMap(({ field }) => field ?? [])
	filters.delete('id')
	reads.push({
		model,
		...(where && { where }),
		fields: [...new Set(fields)],
		...(known && { filters: [...filters] }),
	})
	for (const key of by) through(models, reads, model, key.through)
}
