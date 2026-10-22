// `create`, `update` and `delete` in the order of D-67: access rules on the
// data sent, defaults, validation, `before*` hooks, the required check, the
// write, which a plugin's `redirect` may replace (D-89), `after*` hooks; the
// `*Commit` hooks once it commits (D-71, D-88).
import { and, recordOf } from './access.ts'
import type { Change, Filter, Nested, Row } from './adapter.ts'
import type { Cascade } from './cascade.ts'
import { cascadeOf, cascadeWhere } from './cascade.ts'
import { CheckFailed, UniqueViolation } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { Event } from './hooks.ts'
import { redirectOf, rereads, runHook, settle, settles } from './hooks.ts'
import type { Context } from './query-context.ts'
import { byId, first, given, hiddenBy, picked } from './query-context.ts'
import type { Shape } from './query-args.ts'
import { plan, project, uniqueWhere } from './query-args.ts'
import { createPlan, updatePlan } from './query-write.ts'
import { planned } from './scope.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Checked, Plan, Writing } from './write-plan.ts'
import { moved, updated } from './write-plan.ts'

async function guarded(
	run: Promise<Row[]>,
	checks: readonly Checked[],
): Promise<Row[]> {
	try {
		return await run
	} catch (error) {
		const failed =
			error instanceof CheckFailed ? checks[error.index] : undefined
		if (failed?.restricted !== undefined) {
			throw new PublicError('RELATION_RESTRICTED', failed.message, {
				details: { ...failed.restricted },
				cause: error,
			})
		}
		if (failed !== undefined) {
			throw new PublicError('NOT_FOUND', failed.message, { cause: error })
		}
		if (error instanceof UniqueViolation) {
			throw new PublicError('UNIQUE_VIOLATION', error.message, {
				details: { model: error.model, fields: [...error.fields] },
				cause: error,
			})
		}
		throw error
	}
}

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
	const { models, model, scope } = context
	const writing: Writing = {
		store,
		scope,
		events,
		checks,
		replan: async (moving, id, draft) =>
			updatePlan(models, moving, id, draft, {}, store),
	}
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
	const draft = readData(model, found.get('data'), true)
	const sent: Readonly<Draft> = { ...draft }
	scope.access?.allow(model, 'create', { data: sent })
	await prepared(model, draft, caller, true)
	await runHook(model, 'beforeCreate', { caller, data: draft })
	const { id, plan: steps } = await createPlan(
		models,
		model,
		draft,
		sent,
		store,
	)
	const events: Event[] = [{ model, operation: 'create', id }]
	return written(context, store, commits, steps, events, { id, read, shape })
}

/** The rows a single-row write may target: the caller reads them (D-72). */
async function targets(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<Filter> {
	const { models, model, scope } = context
	return planned(scope, () =>
		and(
			uniqueWhere(models, model, found.get('where'), 'where', scope),
			scope.readable(model.name),
		),
	)
}

/** The stored row a single-row write targets, locked. */
async function target(
	context: Context,
	store: Store,
	found: ReadonlyMap<string, unknown>,
): Promise<Row> {
	const { model } = context
	const where = await targets(context, found)
	const [row] = await store.find({
		model: model.name,
		where,
		take: 1,
		lock: true,
	})
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) {
		throw new PublicError('NOT_FOUND', `No ${model.name} matches.`)
	}
	return row
}

/** The `id` a unique `where` gives, if any. */
function idOf(where: unknown): string | undefined {
	if (typeof where !== 'object' || where === null || !('id' in where)) {
		return undefined
	}
	return typeof where.id === 'string' ? where.id : undefined
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
	const draft = readData(model, found.get('data'), false)
	const sent: Readonly<Draft> = { ...draft }
	const id = idOf(found.get('where'))
	if (scope.access === undefined && id !== undefined && !updated(model)) {
		// Nothing needs the stored row: a check stands for its read (D-99).
		const where = await targets(context, found)
		await prepared(model, draft, caller, false)
		const steps = await updatePlan(models, model, id, draft, sent, store)
		const check = { model: model.name, where, count: 1 }
		const message = `No ${model.name} matches.`
		const at = { id, read, shape }
		return written(context, store, commits, steps, [], at, [{ check, message }])
	}
	const row = await target(context, store, found)
	scope.access?.allow(model, 'update', { record: row, data: sent })
	await prepared(model, draft, caller, false)
	const record = recordOf(model, row)
	await runHook(model, 'beforeUpdate', { caller, record, data: draft })
	const steps = await updatePlan(models, model, row.id, draft, sent, store)
	const events: Event[] = [
		{ model, operation: 'update', id: row.id, before: row },
	]
	const at = { id: row.id, read, shape }
	return written(context, store, commits, steps, events, at)
}

/** The changes and events of a delete's cascade, its hooks run (D-90). */
async function cascaded(
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
	if (scope.access === undefined) {
		// Nothing needs the stored row: a check stands for its read, and the
		// write returns it as it was (D-102).
		const where = await targets(context, found)
		const reach = cascadeWhere(models, model, where)
		if (reach !== undefined) {
			const check = { model: model.name, where, count: 1 }
			const checks: Checked[] = [
				{ check, message: `No ${model.name} matches.` },
			]
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
			return first(rows, shape, undefined)
		}
	}
	const row = await target(context, store, found)
	scope.access?.allow(model, 'delete', { record: row })
	const reach = cascadeWhere(models, model, byId(row.id))
	if (reach !== undefined) {
		const checks = reach.checks.map(({ check }) => check)
		await guarded(store.write({ checks, changes: reach.changes }), reach.checks)
		return project(row, shape, hiddenBy(scope.access))
	}
	const redirected = redirectOf(model) !== undefined
	// A redirected row stays: it cascades nothing (D-90).
	const cascade = redirected
		? { deleted: [{ model, row, redirected }], nulled: [] }
		: await cascadeOf(models, model, row, store)
	const events: Event[] = []
	const writing: Writing = {
		store,
		scope,
		events,
		checks: [],
		replan: async (moving, id, draft) =>
			updatePlan(models, moving, id, draft, {}, store),
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
