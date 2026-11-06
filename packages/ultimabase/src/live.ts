// What the realtime plugin asks the kernel (D-154): a live read's effective
// filter and order, planned once for its caller, and, on a stored row, that
// filter and the row's sort keys, tested as `memory()` reads.
import { accessFor, and } from './access.ts'
import type {
	Condition,
	Filter,
	Nested,
	Order,
	Row,
	Schema,
} from './adapter.ts'
import { contextOf } from './engine.ts'
import { decoded, isRow } from './field-codec.ts'
import { Reader } from './memory-read.ts'
import { sortable } from './memory-values.ts'
import { isFilters } from './memory-conditions.ts'
import { plan, uniqueWhere } from './query-args.ts'
import { shapedRows } from './query-context.ts'
import { modelOf } from './query-where.ts'
import { isObject } from './query-values.ts'
import type { Caller } from './rules.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import { QueryScope, planned } from './scope.ts'
import { reading } from './transaction.ts'

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
		if (field === undefined || field.kind === 'scalar') return true
		return field.kind === 'one' && field.stored && byKey(value)
	})
}

/** Whether a relation's condition reads only its target's id, as a stored key does. */
const byKey = (condition: Condition): boolean =>
	Object.entries(condition).every(
		([operator, filter]) =>
			filter === undefined ||
			((operator === 'is' || operator === 'isNot') &&
				(filter === null ||
					Object.entries(filter).every(
						([key, value]) => key === 'id' || value === undefined,
					))),
	)

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
	const reader = new Reader(
		{ tables: new Map(), joins: new Map() },
		fields,
		true,
	)
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

/** Reads a live read's rows by id, as its caller (D-195). */
export type LiveReader = (
	ids: readonly string[],
	rows?: ReadonlyMap<string, Row>,
	reads?: SharedReads,
) => Promise<readonly Row[]>

/** The adapter reads of one flush, for the live reads that ask the same. */
export type SharedReads = Map<string, Promise<readonly Row[]>>

/**
 * `findMany({ ...shape, where: { id: { in: ids } } })` on `model` as
 * `caller`, planned once (D-195): its read rules and every `beforeFind` run
 * here, its field rules and virtuals on each call. A call takes the rows
 * from the stored `rows`, which hold each of `ids` that exists, when they
 * alone answer it, else from the database.
 */
export async function liveReader(
	model: string,
	shape: unknown,
	caller: Caller,
): Promise<LiveReader> {
	const app = started()
	const { models } = app.resolved
	const context = await contextOf(app, modelOf(models, model), caller)
	const { scope } = context
	const prepared = await app.work.run(async () =>
		planned(scope, () => ({
			...plan(models, context.model, shape, '', 'many', rowKeys, scope),
			rights: scope.readable(model),
		})),
	)
	const { read, shape: shaped, rights } = prepared
	const local =
		read.include === undefined &&
		read.count === undefined &&
		inMemory(model, rights)
	const readable = (row: Row | undefined): row is Row =>
		row !== undefined && (rights === undefined || matches(model, row, rights))
	// A root rule a row answers alone is checked on the stored rows, not on what
	// the read returns, whose relations hold what the caller sees of them: the
	// read then no longer names its caller (D-252).
	const alone = rights !== undefined && inMemory(model, rights)
	const key = JSON.stringify([model, read, alone ? undefined : rights])
	const shared = async (
		ids: readonly string[],
		reads: SharedReads,
	): Promise<readonly Row[]> => {
		const each = `${key} ${ids.join()}`
		const known = reads.get(each)
		if (known !== undefined) return known
		const among = { id: { in: [...ids] } }
		const where = alone ? among : and(among, rights)
		const found = app.adapter.find({ ...read, model, where })
		reads.set(each, found)
		return found
	}
	return async (ids, rows, reads) => {
		if (ids.length === 0) return []
		const root = {
			...read,
			model,
			where: and({ id: { in: [...ids] } }, rights),
		}
		// No async wrapper: a flush makes this call for each subscriber.
		return app.work.run(() =>
			reading(app, async (store) => {
				const found =
					rows !== undefined && local
						? decoded(
								models,
								root,
								ids.map((id) => rows.get(id)).filter(readable),
							)
						: reads === undefined || rows === undefined
							? await store.find(root)
							: decoded(
									models,
									root,
									(await shared(ids, reads)).filter(
										(row) => !alone || readable(rows.get(row.id)),
									),
								)
				const shown = await shapedRows(
					context,
					store,
					found,
					shaped,
					scope.access,
				)
				return shown.filter(isRow)
			}),
		)
	}
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
