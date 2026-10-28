// Virtual fields on read (D-151): each one's input validated once per node
// of the shape, its `run` or `runMany` called as the caller for the rows
// that show it, and a model's rows re-read by id for their relations.
import { AsyncLocalStorage } from 'node:async_hooks'
import { PublicError } from './errors.ts'
import type { Shape, VirtualRead } from './query-args.ts'
import { restrict } from './query-args.ts'
import type { Context } from './query-context.ts'
import type { Computed, Hidden } from './query-project.ts'
import { project, unseenVirtuals } from './query-project.ts'
import { isObject, normalizeWhere } from './query-where.ts'
import { planned } from './scope.ts'
import type { Store } from './transaction.ts'
import { checked } from './validation.ts'

type Row = { readonly [field: string]: unknown }

/** The queries the `run` calls of one virtual send, for the N+1 warning. */
const sent = new AsyncLocalStorage<{ count: number }>()
const warned = new WeakSet<object>()

/** Counts a query toward the `run` calls that send it. */
export function counted(): void {
	const calls = sent.getStore()
	if (calls !== undefined) calls.count += 1
}

const rowsOf = (value: unknown): Row[] =>
	(Array.isArray(value) ? value : [value]).filter(isObject)

/** Whether a virtual is computed at or below `shape`. */
const computes = (shape: Shape): boolean =>
	shape.virtuals.size > 0 || [...shape.relations.values()].some(computes)

/** The virtuals of `rows` and of their relations' rows, by row. */
export async function computeVirtuals(
	context: Context,
	store: Store,
	rows: readonly unknown[],
	shape: Shape,
	hidden: Hidden | undefined,
	computed: Computed = new WeakMap(),
): Promise<Computed> {
	if (!computes(shape)) return computed
	const found = rows.flatMap(rowsOf)
	for (const [name, nested] of shape.relations) {
		const below = found.flatMap((row) => rowsOf(row[name]))
		await computeVirtuals(context, store, below, nested, hidden, computed)
	}
	if (shape.virtuals.size === 0) return computed
	const unseen = new Map(
		found.map((row) => [row, unseenVirtuals(shape, row, hidden)]),
	)
	for (const read of shape.virtuals.values()) {
		const { name } = read.info
		const shown = found.filter((row) => unseen.get(row)?.has(name) !== true)
		if (shown.length === 0) continue
		const values = await valuesOf(context, store, read, shown, hidden)
		shown.forEach((row, index) => {
			const known = computed.get(row) ?? new Map<string, unknown>()
			known.set(name, values[index])
			computed.set(row, known)
		})
	}
	return computed
}

/** The value of `read` for each row, in order. */
async function valuesOf(
	context: Context,
	store: Store,
	read: VirtualRead,
	rows: readonly Row[],
	hidden: Hidden | undefined,
): Promise<readonly unknown[]> {
	const { info, path } = read
	const where = `${info.model}.${info.name}`
	let input: unknown
	if (info.input !== undefined) {
		const prefix = path === '' ? [] : path.split('.')
		const result = await checked(info.input, read.input, prefix, where)
		if ('issues' in result) {
			throw new PublicError('VALIDATION_FAILED', 'Invalid input.', {
				details: { issues: result.issues },
			})
		}
		input = result.value
	}
	const { caller } = context
	const records = rows.map((row) =>
		Object.freeze(
			Object.fromEntries(info.needs.map((need) => [need, row[need] ?? null])),
		),
	)
	let values: readonly unknown[]
	if (info.many) {
		// Its queries are its own, not those of a `run` around it.
		const result: unknown = await sent.exit(async () =>
			info.run(Object.freeze({ caller, input, records })),
		)
		if (!Array.isArray(result) || result.length !== records.length) {
			throw new TypeError(
				`${where}: runMany returns one value per record, ${records.length} here.`,
			)
		}
		values = result
	} else {
		const calls = { count: 0 }
		values = await sent.run(calls, async () =>
			Promise.all(
				records.map(async (record) =>
					info.run(Object.freeze({ caller, input, record })),
				),
			),
		)
		perRow(context, read, records.length, calls.count)
	}
	return info.output.kind === 'model'
		? rereadRows(context, store, read, values, hidden)
		: values
}

/** Warns once per field, outside production, of a `run` querying per row. */
function perRow(
	context: Context,
	read: VirtualRead,
	rows: number,
	queries: number,
): void {
	const { info } = read
	if (rows < 2 || queries < rows || warned.has(info)) return
	if (process.env['NODE_ENV'] === 'production') return
	warned.add(info)
	context.app.logger.warn(
		{ model: info.model, field: info.name },
		`${info.model}.${info.name}: run queried the database once per row; use runMany.`,
	)
}

/**
 * The rows `run` returned, shaped: their scalars as returned, their
 * relations and counts re-read by id as the caller, in one query.
 */
async function rereadRows(
	context: Context,
	store: Store,
	read: VirtualRead,
	values: readonly unknown[],
	hidden: Hidden | undefined,
): Promise<readonly unknown[]> {
	const { info, plan } = read
	const { output } = info
	if (plan === undefined || output.kind !== 'model') return values
	const list = output.form === 'list'
	const items = values.flatMap(rowsOf)
	for (const item of items) {
		if (typeof item['id'] !== 'string') {
			throw new TypeError(
				`${info.model}.${info.name} returned a ${output.name} without its id.`,
			)
		}
	}
	const { shape } = plan
	const target = shape.model
	const found = new Map<unknown, Row>()
	if (shape.relations.size > 0 || shape.counts.length > 0) {
		const { models, scope } = context
		const ids = [...new Set(items.map((item) => item['id']))]
		const readable = await planned(scope, () => scope.readable(target.name))
		const byIds = normalizeWhere(models, target, { id: { in: ids } }, 'where')
		const rows = await store.find({
			model: target.name,
			...restrict({ ...plan.read, where: byIds }, readable),
		})
		for (const row of rows) found.set(row['id'], row)
	}
	const copies = new Map<object, Row>()
	for (const item of items) {
		const row = found.get(item['id'])
		const copy: { [field: string]: unknown } = { ...item }
		// A row the caller cannot read has no relations (D-109).
		for (const name of shape.relations.keys()) {
			const empty = target.fields.get(name)?.kind === 'many' ? [] : null
			copy[name] = row === undefined ? empty : row[name]
		}
		if (shape.counts.length > 0) copy['_count'] = row?.['_count']
		copies.set(item, copy)
	}
	const below = [...copies.values()]
	const computed = await computeVirtuals(context, store, below, shape, hidden)
	const shaped = (item: unknown): unknown => {
		const copy = isObject(item) ? copies.get(item) : undefined
		return copy === undefined ? null : project(copy, shape, hidden, computed)
	}
	return values.map((value) =>
		list && Array.isArray(value) ? value.map(shaped) : shaped(value),
	)
}
