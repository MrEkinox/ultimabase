// `create`, `update` and `delete` in the order of D-67: access rules on the
// data sent, defaults, validation, `before*` hooks, the required check, the
// write, which a plugin's `redirect` may replace (D-89), `after*` hooks; the
// `*Commit` hooks once it commits (D-71, D-88). The row a write decides from
// is locked; a write that loads none answers from the rows it changed (D-99,
// D-104).
import { and, recordOf } from './access.ts'
import type { Filter, Nested, Row } from './adapter.ts'
import { cascadeWhere } from './cascade.ts'
import { deleted } from './delete-many.ts'
import { PublicError } from './errors.ts'
import type { Event } from './hooks.ts'
import { redirectOf, rereads, runHook, settle, settles } from './hooks.ts'
import type { Context } from './query-context.ts'
import { first, given, hiddenBy, picked } from './query-context.ts'
import type { Shape } from './query-args.ts'
import { oneKeys, plan, project, uniqueWhere } from './query-args.ts'
import type { Operations } from './number-update.ts'
import { computeOn, operationsOf, inRange, validates } from './number-update.ts'
import { nests, resolveData } from './nested-write.ts'
import { createPlan, updatePlan } from './query-write.ts'
import { planned } from './scope.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Checked, Plan } from './write-plan.ts'
import { updated } from './write-plan.ts'
import { uuidv7 } from './uuid.ts'
import { guarded, target } from './write-target.ts'
import { writingOf } from './writing.ts'
import { byId } from './query-where.ts'

/** The shape a single-row write returns. */
async function returned(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<{ readonly read: Nested; readonly shape: Shape }> {
	const { models, model, scope } = context
	return planned(scope, () =>
		plan(models, model, picked(found), '', 'one', oneKeys, scope),
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
	const writing = writingOf(scope, store, events, checks)
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

/** Creates the row of `draft` as the rules allow. */
async function creating(
	context: Context,
	store: Store,
	commits: Commit[],
	draft: Draft,
	at: { readonly read: Nested; readonly shape: Shape },
): Promise<unknown> {
	const { model, caller, scope } = context
	const { read, shape } = at
	const made = uuidv7()
	const reach = { scope, reads: store, model, id: made, at: [] }
	await resolveData({ ...reach, creating: true, trusted: false }, draft)
	const sent: Readonly<Draft> = { ...draft }
	scope.access?.allow(model, 'create', { data: sent })
	await prepared(model, draft, caller, true)
	await runHook(model, 'beforeCreate', { caller, data: draft })
	const { id, plan: steps } = await createPlan(
		scope,
		model,
		draft,
		sent,
		store,
		made,
	)
	const events: Event[] = [{ model, operation: 'create', id }]
	return written(context, store, commits, steps, events, { id, read, shape })
}

export async function create(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model } = context
	const found = given(args, model.name, ['data', ...oneKeys], ['data'])
	const at = await returned(context, found)
	const draft = readData(models, model, found.get('data'), true)
	return creating(context, store, commits, draft, at)
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
 * Updates the locked `row` as the rules allow; its number and list updates
 * are computed on it first, so the rules and hooks see the results (D-132,
 * D-149).
 */
async function updating(
	context: Context,
	store: Store,
	commits: Commit[],
	data: { readonly draft: Draft; readonly operations: Operations },
	at: { readonly row: Row; readonly read: Nested; readonly shape: Shape },
): Promise<unknown> {
	const { model, caller, scope } = context
	const { row, read, shape } = at
	const { draft, operations } = data
	computeOn(model, row, draft, operations)
	const reach = { scope, reads: store, model, id: row.id, at: [] }
	await resolveData({ ...reach, creating: false, trusted: false }, draft)
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
		['where', 'data', ...oneKeys],
		['where', 'data'],
	)
	const { read, shape } = await returned(context, found)
	// The data's shape is checked whether or not the row is found.
	const draft = readData(models, model, found.get('data'), false)
	const operations = operationsOf(model, draft)
	const id = idOf(found.get('where'))
	const where = await targets(context, found, 'update')
	if (
		scope.access === undefined &&
		id !== undefined &&
		!updated(model) &&
		!nests(model, draft) &&
		!validates(model, operations)
	) {
		// Nothing needs the stored row: a check stands for its read (D-99),
		// and the write computes its numbers and lists (D-132, D-149).
		const sent: Readonly<Draft> = { ...draft }
		await prepared(model, draft, caller, false)
		const steps = await updatePlan(
			scope,
			model,
			id,
			draft,
			sent,
			store,
			operations,
		)
		const check = { model: model.name, where, count: 1, lock: true }
		const message = missing(model.name)
		const at = { id, read, shape }
		const checks = [{ check, message }]
		const result = await inRange(
			model,
			written(context, store, commits, steps, [], at, checks),
		)
		// The row went between the write's check and its change (D-104).
		if (result === null) throw new PublicError('NOT_FOUND', message)
		return result
	}
	const row = await target(context, store, where)
	const data = { draft, operations }
	return updating(context, store, commits, data, { row, read, shape })
}

export async function remove(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model, scope } = context
	const found = given(args, model.name, ['where', ...oneKeys], ['where'])
	const { read, shape } = await returned(context, found)
	const where = await targets(context, found, 'delete')
	// Its relations and counts, as the caller reads them, before the delete
	// removes any: one read in its transaction (D-135).
	const reaches = shape.relations.size > 0 || shape.counts.length > 0
	const shaped = async (by: Filter, lock: boolean) => {
		if (!reaches) return undefined
		const rows = await store.find({
			model: model.name,
			...read,
			where: by,
			take: 1,
			lock,
		})
		return rows[0]
	}
	const reach = cascadeWhere(models, model, where)
	if (reach !== undefined && scope.access === undefined) {
		const kept = await shaped(where, true)
		// Nothing needs the stored row: a check stands for its read, and the
		// write returns it as its delete removed it (D-102, D-104).
		const check = { model: model.name, where, count: 1, lock: true }
		const checks: Checked[] = [{ check, message: missing(model.name) }]
		checks.push(...reach.checks)
		const rows = await guarded(
			store.last({
				checks: checks.map((each) => each.check),
				changes: reach.changes,
				read: { model: model.name, where, take: 1 },
				before: true,
			}),
			checks,
		)
		// Another transaction removed it meanwhile (D-104).
		if (rows.length === 0)
			throw new PublicError('NOT_FOUND', missing(model.name))
		return first(kept === undefined ? rows : [kept], shape, undefined)
	}
	const row = await target(context, store, where)
	scope.access?.allow(model, 'delete', { record: row })
	const redirected = redirectOf(model) !== undefined
	// A redirected row stays: it is read as the redirect left it (D-89).
	const kept = redirected ? undefined : await shaped(byId(row.id), false)
	await deleted(context, store, commits, [row])
	// The row as the redirect left it, or as it was once gone (D-89).
	const [left] = redirected
		? await store.find({
				model: model.name,
				...read,
				where: byId(row.id),
				take: 1,
			})
		: [kept]
	return project(left ?? row, shape, hiddenBy(scope.access))
}

/** The row an upsert returns, and whether it created it (D-142). */
export type Upserted = { readonly row: unknown; readonly created: boolean }

/**
 * Updates the row `where` targets, or creates it when the caller finds
 * none: the branch that runs is a plain update or create (D-142).
 */
export async function upsert(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<Upserted> {
	const { models, model } = context
	const found = given(
		args,
		model.name,
		['where', 'create', 'update', ...oneKeys],
		['where', 'create', 'update'],
	)
	const at = await returned(context, found)
	// Both data are checked, whichever runs.
	const creation = readData(models, model, found.get('create'), true)
	const draft = readData(models, model, found.get('update'), false)
	const operations = operationsOf(model, draft)
	const where = await targets(context, found, 'update')
	const [row] = await store.find({
		model: model.name,
		where,
		take: 1,
		lock: true,
	})
	// Another create of the row meanwhile fails on its unique index.
	if (row === undefined) {
		return {
			row: await creating(context, store, commits, creation, at),
			created: true,
		}
	}
	const data = { draft, operations }
	const changed = await updating(context, store, commits, data, { row, ...at })
	return { row: changed, created: false }
}
