// What the realtime plugin asks the kernel (D-154): a live read's effective
// filter and order, planned once for its caller, and, on a stored row, that
// filter and the row's sort keys, tested as `memory()` reads.
import { accessFor, and } from './access.ts'
import type { Filter, Order, Row } from './adapter.ts'
import { Reader } from './memory-read.ts'
import { sortable } from './memory-values.ts'
import { isFilters } from './memory-conditions.ts'
import { plan } from './query-args.ts'
import { byIds, modelOf } from './query-where.ts'
import type { Caller } from './rules.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import { QueryScope, planned } from './scope.ts'

/** The rows a live read follows, and their order, ending with `id`. */
export type LivePlan = {
	readonly where: Filter | undefined
	readonly orderBy: readonly Order[]
}

function started(): Running {
	const app = current()
	if (app === undefined) throw new Error('No application is running.')
	return app
}

const liveKeys = new Set(['where', 'orderBy'])

/**
 * The `where` and `orderBy` of `args` as `caller` reads `model`: its read
 * rules and every `beforeFind` included.
 */
export async function livePlan(
	model: string,
	args: unknown,
	caller: Caller,
): Promise<LivePlan> {
	const app = started()
	const { models } = app.resolved
	const info = modelOf(models, model)
	const access = accessFor(models, caller, app.logger)
	const scope = new QueryScope(models, caller, access)
	return app.work.run(async () =>
		planned(scope, () => {
			const { read } = plan(models, info, args, '', 'many', liveKeys, scope)
			return {
				where: and(read.where, scope.readable(model)),
				orderBy: read.orderBy ?? [{ field: 'id', direction: 'asc' }],
			}
		}),
	)
}

/** The stored rows of `ids`, as Master, plugin fields undecoded. */
export async function storedRows(
	model: string,
	ids: readonly string[],
): Promise<readonly Row[]> {
	const app = started()
	return app.work.run(async () =>
		app.adapter.find({ model, where: byIds(ids) }),
	)
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
