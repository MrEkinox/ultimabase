// `create`, `update` and `delete` in the order of D-67: access rules on the
// data sent, defaults, validation, `before*` hooks, the required check, the
// write, which a plugin's `redirect` may replace (D-89), `after*` hooks; the
// `*Commit` hooks once it commits (D-71, D-88). The row a write decides from
// is locked; a write that loads none answers from the rows it changed (D-99,
// D-104).
import { and, recordOf } from './access.ts'
import type { Change, Filter, Nested, Row } from './adapter.ts'
import type { Cascade } from './cascade.ts'
import { cascadeOf, cascadeWhere } from './cascade.ts'
import { PublicError } from './errors.ts'
import type { Event } from './hooks.ts'
import { redirectOf, rereads, runHook, settle, settles } from './hooks.ts'
import type { Context } from './query-context.ts'
import { byId, first, given, hiddenBy, picked } from './query-context.ts'
import type { Shape } from './query-args.ts'
import { plan, project, uniqueWhere } from './query-args.ts'
import type { Numbers } from './number-update.ts'
import {
	computeOn,
	numberUpdates,
	outOfRange,
	validates,
} from './number-update.ts'
import { createPlan, updatePlan } from './query-write.ts'
import { planned } from './scope.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Checked, Plan, Writing } from './write-plan.ts'
import { moved, updated } from './write-plan.ts'
import { guarded, target } from './write-target.ts'

/** The shape a single-row write returns. */
async function returned(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<{ readonly read: Nested; readonly shape: Shape }> {
	const { models, model, scope } = context
	const keys = new Set(['select', 'include'])
	return planned(scope, () =>
		plan(models, model, picked(found), '', 'one', keys, scope),
	)
}

/**
 * Runs the plan, then the `after*` hooks. The written row comes back even
 * when a read rule or `beforeFind` would hide it (D-86, D-88).
 */
async function written(
	context: Context,
	store: Store,
	commits: Commit[],
	steps: Plan,
	events: Event[],
	at: { readonly id: string; readonly read: Nested; readonly shape: Shape },
	checks: Checked[] = [],
): Promise<unknown> {
	const { model, scope } = context
	const writing: Writing = {
		store,
		scope,
		events,
		checks,
		replan: async (moving, id, draft) =>
			updatePlan(scope, moving, id, draft, {}, store),
	}
	// The rows it creates, after the row written, before the rows it moves.
	events.push(...steps.events)
	await steps.check(writing)
	const changes = await steps.changes(writing)
	const read = { model: model.name, ...at.read, where: byId(at.id) }
	const again = rereads(events)
	const write = {
		checks: checks.map(({ check }) => check),
		changes,
		...(again ? {} : { read }),
	}
	// Nothing follows a write without hooks: it may need no transaction.
	const run = settles(events) ? store.write(write) : store.last(write)
	const rows = await guarded(run, checks)
	await settle(store, scope.caller, events, commits)
	// An `after*` hook may have changed the rows: read them again (D-88).
	const result = again ? await store.find(read) : rows
	return first(result, at.shape, scope.access)
}

export async function create(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model, caller, scope } = context
	const found = given(args, model.name, ['data', 'select', 'include'], ['data'])
	const { read, shape } = await returned(context, found)
	const draft = readData(models, model, found.get('data'), true)
	const sent: Readonly<Draft> = { ...draft }
	scope.access?.allow(model, 'create', { data: sent })
	await prepared(model, draft, caller, true)
	await runHook(model, 'beforeCreate', { caller, data: draft })
	const { id, plan: steps } = await createPlan(scope, model, draft, sent, store)
	const events: Event[] = [{ model, operation: 'create', id }]
	return written(context, store, commits, steps, events, { id, read, shape })
}

/**
 * The rows a single-row write may target: the caller reads them (D-72), and
 * the `beforeFind` hooks let it `operation` them (D-124).
 */
async function targets(
	context: Context,
	found: ReadonlyMap<string, unknown>,
	operation: 'update' | 'delete',
): Promise<Filter> {
	const { models, model, scope } = context
	return planned(scope, () =>
		and(
			uniqueWhere(models, model, found.get('where'), 'where', scope),
			scope.readable(model.name, operation),
		),
	)
}

const missing = (model: string): string => `No ${model} matches.`

/** The `id` a unique `where` gives, if any. */
function idOf(where: unknown): string | undefined {
	if (typeof where !== 'object' || where === null || !('id' in where)) {
		return undefined
	}
	return typeof where.id === 'string' ? where.id : undefined
}

/**
 * Updates the locked `row` as the rules allow; its number updates are
 * computed on it first, so the rules and hooks see the results (D-132).
 */
async function updating(
	context: Context,
	store: Store,
	commits: Commit[],
	data: { readonly draft: Draft; readonly numbers: Numbers },
	at: { readonly row: Row; readonly read: Nested; readonly shape: Shape },
): Promise<unknown> {
	const { model, caller, scope } = context
	const { row, read, shape } = at
	const { draft, numbers } = data
	computeOn(model, row, draft, numbers)
	const sent: Readonly<Draft> = { ...draft }
	scope.access?.allow(model, 'update', { record: row, data: sent })
	await prepared(model, draft, caller, false)
	const record = recordOf(model, row)
	await runHook(model, 'beforeUpdate', { caller, record, data: draft })
	const steps = await updatePlan(scope, model, row.id, draft, sent, store)
	const events: Event[] = [
		{ model, operation: 'update', id: row.id, before: row },
	]
	const to = { id: row.id, read, shape }
	return written(context, store, commits, steps, events, to)
}

export async function update(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model, caller, scope } = context
	const found = given(
		args,
		model.name,
		['where', 'data', 'select', 'include'],
		['where', 'data'],
	)
	const { read, shape } = await returned(context, found)
	// The data's shape is checked whether or not the row is found.
	const draft = readData(models, model, found.get('data'), false)
	const numbers = numberUpdates(model, draft)
	const id = idOf(found.get('where'))
	const where = await targets(context, found, 'update')
	if (
		scope.access === undefined &&
		id !== undefined &&
		!updated(model) &&
		!validates(model, numbers)
	) {
		// Nothing needs the stored row: a check stands for its read (D-99),
		// and the write computes its numbers (D-132).
		const sent: Readonly<Draft> = { ...draft }
		await prepared(model, draft, caller, false)
		const steps = await updatePlan(
			scope,
			model,
			id,
			draft,
			sent,
			store,
			numbers,
		)
		const check = { model: model.name, where, count: 1, lock: true }
		const message = missing(model.name)
		const at = { id, read, shape }
		const checks = [{ check, message }]
		const result = await written(
			context,
			store,
			commits,
			steps,
			[],
			at,
			checks,
		).catch((error: unknown) => {
			throw outOfRange(model, error)
		})
		// The row went between the write's check and its change (D-104).
		if (result === null) throw new PublicError('NOT_FOUND', message)
		return result
	}
	const row = await target(context, store, where)
	const data = { draft, numbers }
	return updating(context, store, commits, data, { row, read, shape })
}

/** The changes and events of a delete's cascade, its hooks run (D-90). */
export async function cascaded(
	context: Context,
	writing: Writing,
	cascade: Cascade,
): Promise<Change[]> {
	const { caller } = context
	const changes: Change[] = []
	for (const { model, field, rows } of cascade.nulled) {
		const step = { model: model.name, field, to: null }
		changes.push(...(await moved(step, model, rows, writing)))
	}
	for (const { model, row } of cascade.deleted) {
		await runHook(model, 'beforeDelete', {
			caller,
			record: recordOf(model, row),
		})
	}
	const ids = new Map<string, string[]>()
	for (const { model, row, redirected } of cascade.deleted) {
		const redirect = redirected ? redirectOf(model) : undefined
		// Its queries run their own pipeline, in this transaction (D-89).
		if (redirect !== undefined) await redirect(caller, row.id)
		else ids.set(model.name, [...(ids.get(model.name) ?? []), row.id])
	}
	for (const [model, deleted] of ids) {
		changes.push({ kind: 'delete', model, where: { id: { in: deleted } } })
	}
	for (const { model, row } of cascade.deleted) {
		writing.events.push({ model, operation: 'delete', id: row.id, before: row })
	}
	return changes
}

export async function remove(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model, caller, scope } = context
	const found = given(args, model.name, ['where'], ['where'])
	const { shape } = plan(models, model, undefined, '', 'one', new Set())
	const where = await targets(context, found, 'delete')
	const reach = cascadeWhere(models, model, where)
	if (reach !== undefined && scope.access === undefined) {
		// Nothing needs the stored row: a check stands for its read, and the
		// write returns it as its delete removed it (D-102, D-104).
		const check = { model: model.name, where, count: 1, lock: true }
		const checks: Checked[] = [{ check, message: missing(model.name) }]
		checks.push(...reach.checks)
		const read = { model: model.name, where, take: 1 }
		const rows = await guarded(
			store.last({
				checks: checks.map((each) => each.check),
				changes: reach.changes,
				read,
				before: true,
			}),
			checks,
		)
		// Another transaction removed it meanwhile (D-104).
		if (rows.length === 0)
			throw new PublicError('NOT_FOUND', missing(model.name))
		return first(rows, shape, undefined)
	}
	const row = await target(context, store, where)
	scope.access?.allow(model, 'delete', { record: row })
	const locked = cascadeWhere(models, model, byId(row.id))
	if (locked !== undefined) {
		const checks = locked.checks.map(({ check }) => check)
		await guarded(
			store.write({ checks, changes: locked.changes }),
			locked.checks,
		)
		return project(row, shape, hiddenBy(scope.access))
	}
	const redirected = redirectOf(model) !== undefined
	// A redirected row stays: it cascades nothing (D-90).
	const cascade = redirected
		? { deleted: [{ model, row, redirected }], nulled: [] }
		: await cascadeOf(models, model, [row], store)
	const events: Event[] = []
	const writing: Writing = {
		store,
		scope,
		events,
		checks: [],
		replan: async (moving, id, draft) =>
			updatePlan(scope, moving, id, draft, {}, store),
	}
	const changes = await cascaded(context, writing, cascade)
	if (changes.length > 0) {
		const checks = writing.checks.map(({ check }) => check)
		await guarded(store.write({ checks, changes }), writing.checks)
	}
	await settle(store, caller, events, commits)
	// The row as the redirect left it, or as it was once gone (D-89).
	const [left] = redirected
		? await store.find({ model: model.name, where: byId(row.id), take: 1 })
		: []
	return project(left ?? row, shape, hiddenBy(scope.access))
}
