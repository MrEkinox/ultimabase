// `updateMany` (D-133): what an `update` runs, on each row its `where`
// selects, all or nothing; one write when nothing needs the rows (D-99).
import { recordOf } from './access.ts'
import type { Change, Filter, Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Event } from './hooks.ts'
import { runHook, settle } from './hooks.ts'
import type { Numbers } from './number-update.ts'
import {
	computeOn,
	numberUpdates,
	outOfRange,
	validates,
} from './number-update.ts'
import type { Context } from './query-context.ts'
import { filtered, given } from './query-context.ts'
import { entries } from './query-where.ts'
import { updatePlan } from './query-write.ts'
import type { ModelInfo } from './schema.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Plan } from './write-plan.ts'
import { updated } from './write-plan.ts'
import { guarded } from './write-target.ts'
import { writingOf } from './writing.ts'

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

/** Rows whose data came out the same, and the numbers the write computes. */
type Group = {
	readonly draft: Draft
	readonly numbers: Numbers
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
		[...a.numbers.keys()].join() === [...b.numbers.keys()].join()
	)
}

/**
 * A row's data after its hooks: a number they left as computed is computed
 * by the write again, the row being locked, so rows share one statement.
 */
function settled(item: Item, numbers: Numbers): Omit<Group, 'items'> {
	const left = new Map(numbers)
	const draft: Draft = { ...item.draft }
	for (const name of numbers.keys()) {
		if (Object.is(item.draft[name], item.sent[name])) delete draft[name]
		else left.delete(name)
	}
	return { draft, numbers: left }
}

/** The rows by data; one a hook gave a relation write is planned alone. */
function grouped(model: ModelInfo, items: readonly Item[], numbers: Numbers) {
	const groups: Group[] = []
	for (const item of items) {
		const each = settled(item, numbers)
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

/** Each row through the update rule and hooks, then their writes (D-133). */
async function lockedRows(
	context: Context,
	store: Store,
	commits: Commit[],
	data: { readonly draft: Draft; readonly numbers: Numbers },
	where: Filter,
): Promise<{ readonly count: number }> {
	const { model, caller, scope } = context
	const { numbers } = data
	// In id order, so two calls on the same rows wait instead of deadlocking.
	const orderBy = [{ field: 'id', direction: 'asc' }] as const
	const rows = await store.find({
		model: model.name,
		where,
		orderBy,
		lock: true,
	})
	const items = rows.map((row): Item => {
		const draft: Draft = { ...data.draft }
		computeOn(model, row, draft, numbers)
		return { row, draft, sent: { ...draft } }
	})
	// One row refused, none written (D-111).
	for (const { row, sent } of items) {
		scope.access?.allow(model, 'update', { record: row, data: sent })
	}
	if (items.length === 0) return { count: 0 }
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
	for (const group of grouped(model, items, numbers)) {
		const [{ row, sent }] = group.items
		const plan = await updatePlan(
			scope,
			model,
			row.id,
			group.draft,
			sent,
			store,
			group.numbers,
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
	const checks = writing.checks.map(({ check }) => check)
	await guarded(store.write({ checks, changes }), writing.checks).catch(
		(error: unknown) => {
			throw outOfRange(model, error)
		},
	)
	await settle(store, caller, events, commits)
	return { count: items.length }
}

export async function updateMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const { model, caller, scope } = context
	const found = given(args, model.name, ['where', 'data'], ['data'])
	const draft = scalarData(context, found.get('data'))
	const numbers = numberUpdates(model, draft)
	const where: Filter = (await filtered(context, found, 'update')) ?? {}
	if (
		scope.access !== undefined ||
		updated(model) ||
		validates(model, numbers)
	) {
		return lockedRows(context, store, commits, { draft, numbers }, where)
	}
	// Nothing needs the stored rows: one UPDATE, which computes the numbers
	// and counts the rows it changed (D-104).
	await prepared(model, draft, caller, false)
	const plan = await updatePlan(scope, model, '', draft, draft, store, numbers)
	const write = {
		changes: spread(plan, where),
		read: { model: model.name },
		before: true,
	}
	const rows = await guarded(store.last(write), []).catch((error: unknown) => {
		throw outOfRange(model, error)
	})
	return { count: rows.length }
}
