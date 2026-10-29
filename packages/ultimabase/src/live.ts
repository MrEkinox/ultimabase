// What the realtime plugin asks the kernel (D-154): a live read's effective
// filter and order, planned once for its caller, and, on a stored row, that
// filter and the row's sort keys, tested as `memory()` reads.
import { accessFor, and } from './access.ts'
import type { Filter, Nested, Order, Read, Row, Schema } from './adapter.ts'
import { rootFind } from './engine.ts'
import { decoded, isRow } from './field-codec.ts'
import { Reader } from './memory-read.ts'
import { compareKeys, sortable } from './memory-values.ts'
import { isFilters } from './memory-conditions.ts'
import { plan, uniqueWhere } from './query-args.ts'
import { modelOf } from './query-where.ts'
import { isObject } from './query-values.ts'
import type { Caller } from './rules.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import { QueryScope, planned } from './scope.ts'

/**
 * The rows a live read follows, and their order, ending with `id`; `filter`
 * is the read's own part of `where`, `rights` the part the caller's read
 * rules and `beforeFind` add, and
 * `include`, `count` and `fields` what its selection reads, as the adapter
 * receives them.
 */
export type LivePlan = Pick<Nested, 'include' | 'count' | 'fields'> & {
	readonly where: Filter | undefined
	readonly filter: Filter | undefined
	readonly rights: Filter | undefined
	readonly orderBy: readonly Order[]
}

function started(): Running {
	const app = current()
	if (app === undefined) throw new Error('No application is running.')
	return app
}

const shapeKeys = ['select', 'include', 'omit']
const liveKeys = new Set(['where', 'orderBy', ...shapeKeys])
const rowKeys = new Set(shapeKeys)

/**
 * `args` as `caller` reads `model`: its read rules and every `beforeFind`
 * included. A live row's `where` names one row, as `findUnique`'s.
 */
export async function livePlan(
	model: string,
	args: unknown,
	caller: Caller,
	row = false,
): Promise<LivePlan> {
	const app = started()
	const { models } = app.resolved
	const info = modelOf(models, model)
	const access = accessFor(models, caller, app.logger)
	const scope = new QueryScope(models, caller, access)
	const { where: unique, ...shape } = isObject(args) ? args : {}
	return app.work.run(async () =>
		planned(scope, () => {
			const { read } = row
				? plan(models, info, shape, '', 'many', rowKeys, scope)
				: plan(models, info, args, '', 'many', liveKeys, scope)
			const rights = scope.readable(model)
			const where = row
				? uniqueWhere(models, info, unique, 'where', scope)
				: read.where
			const { include, count, fields } = read
			return {
				...(include && { include }),
				...(count && { count }),
				...(fields && { fields }),
				where: and(where, rights),
				filter: where,
				rights,
				orderBy: read.orderBy ?? [{ field: 'id', direction: 'asc' }],
			}
		}),
	)
}

/** The stored rows `read` finds, as Master, plugin fields undecoded. */
export async function storedRows(
	model: string,
	read: Nested,
): Promise<readonly Row[]> {
	const app = started()
	return app.work.run(async () => app.adapter.find({ ...read, model }))
}

/** The running application's schema, its plugins' models included. */
export function liveSchema(): Schema {
	return started().resolved.schema
}

/** Whether `filter` reads `model`'s row alone, so `matches` can test it. */
export function inMemory(model: string, filter: Filter | undefined): boolean {
	const fields = modelOf(started().resolved.models, model).fields
	return Object.entries(filter ?? {}).every(([key, value]) => {
		if (value === undefined) return true
		if (isFilters(value)) return value.every((part) => inMemory(model, part))
		// A search ranks as each database does (D-148).
		if (value.search !== undefined || value.removedBy !== undefined) {
			return false
		}
		const field = fields.get(key)
		return field === undefined || field.kind === 'scalar'
	})
}

const readers = new WeakMap<Running, Reader>()

function readerOf(app: Running): Reader {
	const known = readers.get(app)
	if (known !== undefined) return known
	const fields = new Map(
		app.resolved.schema.models.map((model) => [
			model.name,
			new Map(model.fields.map((field) => [field.name, field])),
		]),
	)
	const reader = new Reader({ tables: new Map(), joins: new Map() }, fields)
	readers.set(app, reader)
	return reader
}

/** Whether the stored `row` of `model` passes `filter`, which `inMemory` takes. */
export function matches(
	model: string,
	row: Row,
	filter: Filter | undefined,
): boolean {
	return readerOf(started()).matches(model, row, filter) === true
}

/** Whether rows alone answer `read`: one level, unpaged, read in memory. */
const servable = (read: Read): boolean =>
	read.include === undefined &&
	read.count === undefined &&
	read.distinct === undefined &&
	read.cursor === undefined &&
	read.skip === undefined &&
	read.take === undefined &&
	(read.orderBy ?? []).every(
		(order) => (order.through ?? order.count ?? order.relevance) === undefined,
	) &&
	inMemory(read.model, read.where)

/** The stored `rows` that pass `read`, in its order and with its fields. */
function served(read: Read, rows: Iterable<Row>): Row[] {
	const { model, fields, orderBy = [] } = read
	const kept = [...rows].filter((row) => matches(model, row, read.where))
	const keys = new Map(kept.map((row) => [row, sortKeys(model, row, orderBy)]))
	const key = (row: Row): unknown[] => keys.get(row) ?? []
	kept.sort((a, b) => compareKeys(key(a), key(b), orderBy))
	if (fields === undefined) return kept
	return kept.map((row) => ({
		...Object.fromEntries(fields.map((field) => [field, row[field]])),
		id: row.id,
	}))
}

/**
 * `findMany(args)` on `model` as `caller`, its rows taken from the stored
 * `rows` when they alone answer it, else from the database. `rows` holds
 * every row its `where` finds.
 */
export async function servedRows(
	model: string,
	args: unknown,
	caller: Caller,
	rows: ReadonlyMap<string, Row>,
): Promise<readonly Row[]> {
	const { models } = started().resolved
	const found = await rootFind(
		model,
		args,
		{ as: caller },
		async (store, read) =>
			servable(read)
				? decoded(models, read, served(read, rows.values()))
				: store.find(read),
	)
	return Array.isArray(found) ? found.filter(isRow) : []
}

/** The sort keys of the stored `row`, for an order on its own fields. */
export function sortKeys(
	model: string,
	row: Row,
	orderBy: readonly Order[],
): unknown[] {
	const reader = readerOf(started())
	return orderBy.map((order) => {
		if (order.through ?? order.count ?? order.relevance) {
			throw new Error(`The order by ${order.field} reads another row.`)
		}
		return sortable(row[order.field] ?? null, reader.field(model, order.field))
	})
}
