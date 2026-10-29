// The reads a caller's construction makes (D-154): `identify`, the plugins'
// `caller` and `beforeFind` run inside `recording`, which keeps what each
// read reached, so a write to one of them rebuilds the caller.
import { AsyncLocalStorage } from 'node:async_hooks'
import type {
	AggregateRead,
	CountRead,
	Filter,
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
}

const recorder = new AsyncLocalStorage<Recorded[]>()

/** Runs `run`, keeping each read the kernel makes until it settles. */
export async function recording<R>(
	run: () => Promise<R>,
): Promise<{ readonly result: R; readonly reads: readonly Recorded[] }> {
	const reads: Recorded[] = []
	const result = await recorder.run(reads, run)
	return { result, reads: [...reads] }
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
		const reached = { ...(nested.where && { where: nested.where }) }
		const target = follow(models, reads, model, name, {
			...reached,
			ids: idsOf(found),
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
	const reads = recorder.getStore()
	if (reads === undefined) return
	const { model, where } = read
	reads.push({ model, ...(where && { where }), ids: idsOf(rows) })
	followed(models, reads, model, read, rows)
}

/** Keeps a count or an aggregate, if a recording runs. */
export function recordCount(
	models: Models,
	read: CountRead | AggregateRead,
): void {
	const reads = recorder.getStore()
	if (reads === undefined) return
	const { model, where } = read
	reads.push({ model, ...(where && { where }) })
	const by = 'by' in read ? (read.by ?? []) : []
	for (const key of by) through(models, reads, model, key.through)
}
