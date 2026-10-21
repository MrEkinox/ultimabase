// `create`, `update` and `delete` in the order of D-67: access rules on the
// data sent, defaults, validation, `before*` hooks, the required check, the
// write, `after*` hooks; the `*Commit` hooks once it commits (D-71, D-88).
import { and, recordOf } from './access.ts'
import type { Nested, Row } from './adapter.ts'
import { UniqueViolation } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { Event } from './hooks.ts'
import { rereads, runHook, settle } from './hooks.ts'
import type { Context } from './query-context.ts'
import { byId, first, given, hiddenBy, picked } from './query-context.ts'
import type { Shape } from './query-args.ts'
import { plan, project, uniqueWhere } from './query-args.ts'
import { createPlan, updatePlan } from './query-write.ts'
import { planned } from './scope.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Plan, Writing } from './write-plan.ts'

async function guarded(run: Promise<Row[]>): Promise<Row[]> {
	try {
		return await run
	} catch (error) {
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
): Promise<unknown> {
	const { models, model, scope } = context
	const writing: Writing = {
		store,
		scope,
		events,
		replan: async (moved, id, draft) =>
			updatePlan(models, moved, id, draft, {}, store),
	}
	await steps.check(writing)
	const changes = await steps.changes(writing)
	const read = { model: model.name, ...at.read, where: byId(at.id) }
	const again = rereads(events)
	const rows = await guarded(
		store.write({ changes, ...(again ? {} : { read }) }),
	)
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

/** The stored row a single-row write targets, `undefined` when unseen. */
async function target(
	context: Context,
	store: Store,
	found: ReadonlyMap<string, unknown>,
): Promise<Row> {
	const { models, model, scope } = context
	const where = await planned(scope, () =>
		and(
			uniqueWhere(models, model, found.get('where'), 'where', scope),
			scope.readable(model.name),
		),
	)
	const [row] = await store.find({ model: model.name, where, take: 1 })
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) {
		throw new PublicError('NOT_FOUND', `No ${model.name} matches.`)
	}
	return row
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

export async function remove(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model, caller, scope } = context
	const found = given(args, model.name, ['where'], ['where'])
	const { shape } = plan(models, model, undefined, '', 'one', new Set())
	const row = await target(context, store, found)
	scope.access?.allow(model, 'delete', { record: row })
	await runHook(model, 'beforeDelete', {
		caller,
		record: recordOf(model, row),
	})
	await guarded(
		store.write({
			changes: [{ kind: 'delete', model: model.name, where: byId(row.id) }],
		}),
	)
	const events: Event[] = [
		{ model, operation: 'delete', id: row.id, before: row },
	]
	await settle(store, caller, events, commits)
	return project(row, shape, hiddenBy(scope.access))
}
