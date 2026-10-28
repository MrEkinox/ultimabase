// `updateMany` (D-133): what an `update` runs, on each row its `where`
// selects, all or nothing; one write when nothing needs the rows (D-99).
// `updateManyAndReturn` returns them in `id` order, each as `update` does
// (D-149).
import { recordOf } from './access.ts'
import type { Change, Filter, Order, Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Event } from './hooks.ts'
import { rereads, runHook, settle } from './hooks.ts'
import type { Operations } from './number-update.ts'
import { computeOn, operationsOf, inRange, validates } from './number-update.ts'
import type { Plan as Shaped } from './query-args.ts'
import { oneKeys } from './query-args.ts'
import type { Context } from './query-context.ts'
import { filtered, given, shapedRows } from './query-context.ts'
import { byIds, entries } from './query-where.ts'
import { updatePlan } from './query-write.ts'
import type { ModelInfo } from './schema.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Plan } from './write-plan.ts'
import { updated } from './write-plan.ts'
import { checkedWrite, guarded } from './write-target.ts'
import { writingOf } from './writing.ts'
import { returned } from './writes.ts'

// In id order, so two calls on the same rows wait instead of deadlocking.
const orderBy: readonly Order[] = [{ field: 'id', direction: 'asc' }]

/** The scalar data of the rows, as `update` reads it (D-133 point 2). */
function scalarData(context: Context, data: unknown): Draft {
	const { models, model } = context
	for (const [name] of entries(data, 'data')) {
		if (model.fields.get(name)?.kind === 'scalar') continue
		if (!model.fields.has(name)) continue
		const path = `data.${name}`
		throw new InvalidQuery(
			path,
			`${path} is a relation, which updateMany does not write.`,
		)
	}
	return readData(models, model, data, false)
}

/** The plan's update, spread to every row `where` selects. */
function spread(plan: Plan, where: Filter): Change[] {
	return plan.steps.flatMap((step) =>
		step.kind === 'update' ? [{ ...step, where }] : [],
	)
}

/** A row, its own copy of the data, and the data the rules saw (D-133). */
type Item = {
	readonly row: Row
	readonly draft: Draft
	readonly sent: Readonly<Draft>
}

/** Rows whose data came out the same, and the operations the write computes. */
type Group = {
	readonly draft: Draft
	readonly operations: Operations
	readonly items: [Item, ...Item[]]
}

const same = (a: Group, b: Omit<Group, 'items'>): boolean => {
	const keys = Object.keys(a.draft)
	return (
		keys.length === Object.keys(b.draft).length &&
		keys.every(
			(key) =>
				Object.hasOwn(b.draft, key) && Object.is(a.draft[key], b.draft[key]),
		) &&
		[...a.operations.keys()].join() === [...b.operations.keys()].join()
	)
}

/**
 * A row's data after its hooks: a number or list they left as computed is
 * computed by the write again, the row being locked, so rows share one
 * statement.
 */
function settled(item: Item, operations: Operations): Omit<Group, 'items'> {
	const left = new Map(operations)
	const draft: Draft = { ...item.draft }
	for (const name of operations.keys()) {
		if (Object.is(item.draft[name], item.sent[name])) delete draft[name]
		else left.delete(name)
	}
	return { draft, operations: left }
}

/** The rows by data; one a hook gave a relation write is planned alone. */
function grouped(
	model: ModelInfo,
	items: readonly Item[],
	operations: Operations,
) {
	const groups: Group[] = []
	for (const item of items) {
		const each = settled(item, operations)
		const scalars = Object.keys(each.draft).every(
			(name) => model.fields.get(name)?.kind === 'scalar',
		)
		const found = scalars
			? groups.find((group) => same(group, each))
			: undefined
		if (found === undefined) groups.push({ ...each, items: [item] })
		else found.items.push(item)
	}
	return groups
}

/**
 * Each row through the update rule and hooks, then their writes (D-133):
 * the rows changed, or with `at` as it shapes them.
 */
async function lockedRows(
	context: Context,
	store: Store,
	commits: Commit[],
	data: { readonly draft: Draft; readonly operations: Operations },
	where: Filter,
	at: Shaped | undefined,
): Promise<readonly unknown[]> {
	const { model, caller, scope } = context
	const { operations } = data
	const rows = await store.find({
		model: model.name,
		where,
		orderBy,
		lock: true,
	})
	const items = rows.map((row): Item => {
		const draft: Draft = { ...data.draft }
		computeOn(model, row, draft, operations)
		return { row, draft, sent: { ...draft } }
	})
	// One row refused, none written (D-111).
	for (const { row, sent } of items) {
		scope.access?.allow(model, 'update', { record: row, data: sent })
	}
	if (items.length === 0) return []
	for (const { row, draft } of items) {
		await prepared(model, draft, caller, false)
		const record = recordOf(model, row)
		await runHook(model, 'beforeUpdate', { caller, record, data: draft })
	}
	const events: Event[] = items.map(({ row }) => ({
		model,
		operation: 'update',
		id: row.id,
		before: row,
	}))
	const writing = writingOf(scope, store, events)
	const changes: Change[] = []
	for (const group of grouped(model, items, operations)) {
		const [{ row, sent }] = group.items
		const plan = await updatePlan(
			scope,
			model,
			row.id,
			group.draft,
			sent,
			store,
			group.operations,
		)
		events.push(...plan.events)
		await plan.check(writing)
		const ids = group.items.map((item) => item.row.id)
		const one = ids.length === 1
		changes.push(
			...(one
				? await plan.changes(writing)
				: spread(plan, { id: { in: ids } })),
		)
	}
	const ids = items.map((item) => item.row.id)
	const read = at && {
		model: model.name,
		...at.read,
		where: byIds(ids),
		orderBy,
	}
	// An `after*` hook may change the rows: they are read once it ran (D-88).
	const again = rereads(events)
	const written = await inRange(
		model,
		checkedWrite(store, writing.checks, changes, again ? undefined : read),
	)
	await settle(store, caller, events, commits)
	if (at === undefined || read === undefined) return ids
	const result = again ? await store.find(read) : written
	return shapedRows(result, at.shape, scope.access)
}

/**
 * Updates the rows `where` selects: their ids, or with `at` the rows as it
 * shapes them, in `id` order. The rows come back even when a read rule
 * would hide them, as `update`'s does (D-86).
 */
async function updating(
	context: Context,
	store: Store,
	commits: Commit[],
	found: ReadonlyMap<string, unknown>,
	at?: Shaped,
): Promise<readonly unknown[]> {
	const { model, caller, scope } = context
	const draft = scalarData(context, found.get('data'))
	const operations = operationsOf(model, draft)
	const where: Filter = (await filtered(context, found, 'update')) ?? {}
	// A relation read beside the UPDATE would see its rows as they were.
	const nests = at?.read.include !== undefined || at?.read.count !== undefined
	if (
		scope.access !== undefined ||
		updated(model) ||
		validates(model, operations) ||
		nests
	) {
		const data = { draft, operations }
		return lockedRows(context, store, commits, data, where, at)
	}
	// Nothing needs the stored rows: one UPDATE, which computes the numbers
	// and lists and returns the rows it changed (D-104).
	await prepared(model, draft, caller, false)
	const plan = await updatePlan(
		scope,
		model,
		'',
		draft,
		draft,
		store,
		operations,
	)
	const write = {
		changes: spread(plan, where),
		read: { model: model.name, ...at?.read, orderBy },
		before: true,
	}
	const rows = await inRange(model, guarded(store.last(write), []))
	if (at === undefined) return rows.map((row) => row.id)
	return shapedRows(rows, at.shape, scope.access)
}

export async function updateMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const found = given(args, context.model.name, ['where', 'data'], ['data'])
	const ids = await updating(context, store, commits, found)
	return { count: ids.length }
}

export async function updateManyAndReturn(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<readonly unknown[]> {
	const keys = ['where', 'data', ...oneKeys]
	const found = given(args, context.model.name, keys, ['data'])
	const at = await returned(context, found)
	return updating(context, store, commits, found, at)
}
