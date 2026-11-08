// `create`, `update` and `delete` in the order of D-67: access rules on the
// data sent, defaults, validation, `before*` hooks, the required check, the
// write, which a plugin's `redirect` may replace (D-89), `after*` hooks; the
// `*Commit` hooks once it commits (D-71, D-88). The row a write decides from
// is locked; a write that loads none answers from the rows it changed (D-99,
// D-104).
import type { Access } from './access.ts'
import { recordOf } from './access.ts'
import type { Check, Filter, Lock, Nested, Row } from './adapter.ts'
import { cascadeWhere } from './cascade.ts'
import { deleted } from './delete-many.ts'
import { PublicError } from './errors.ts'
import type { Event } from './hooks.ts'
import { redirectOf, rereads, runHook, settle, settles } from './hooks.ts'
import type { Context } from './query-context.ts'
import { first, given, hiddenBy, picked } from './query-context.ts'
import { project } from './query-project.ts'
import { computeVirtuals } from './virtual-read.ts'
import type { Shape } from './query-args.ts'
import { oneKeys, plan } from './query-args.ts'
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
import {
	guarded,
	missing,
	target,
	targets,
	unloadedBy,
} from './write-target.ts'
import { writingOf } from './writing.ts'
import { withinChecks } from './within.ts'
import { rowChecks } from './write-filter.ts'
import { byId } from './query-where.ts'

/** The shape a single-row write returns, and each row of a bulk one's (D-149). */
export async function returned(
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
	at: { readonly where: Filter; readonly read: Nested; readonly shape: Shape },
	checks: Checked[] = [],
): Promise<unknown> {
	const { model, scope } = context
	const writing = writingOf(scope, store, events, checks)
	// The rows it creates, after the row written, before the rows it moves.
	events.push(...steps.events)
	await steps.check(writing)
	const changes = await steps.changes(writing)
	const ruled = rowChecks(scope.access, changes)
	const within = await withinChecks(context.models, store, changes, events)
	checks.push(...ruled.before, ...within)
	const read = { model: model.name, ...at.read, where: at.where }
	const again = rereads(events)
	const write = {
		checks: checks.map(({ check }) => check),
		changes,
		...(again ? {} : { read }),
	}
	// Nothing follows a write without hooks or checks after it: it may need
	// no transaction.
	const alone = !settles(events) && !ruled.after
	const rows = await guarded(
		alone ? store.last(write) : store.write(write),
		checks,
	)
	await ruled.verify(store)
	await settle(store, scope.caller, events, commits)
	// An `after*` hook may have changed the rows: read them again (D-88).
	const result = again ? await store.find(read) : rows
	return first(context, store, result, at.shape, scope.access)
}

/** Creates the row of `draft` as the rules allow. */
export async function creating(
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
	scope.access?.allow(model, 'create', { data: sent, id: made })
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
	const to = { where: byId(id), read, shape }
	return written(context, store, commits, steps, events, to)
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
 * Updates the locked `row` as the rules allow; its number and list updates
 * are computed on it first, so the rules and hooks see the results (D-132,
 * D-149).
 */
export async function updating(
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
	const to = { where: byId(row.id), read, shape }
	return written(context, store, commits, steps, events, to)
}

/**
 * Whether an update needs no stored row: a check stands for its read (D-99).
 * The rules run first, on its scalar data, without the row (D-342).
 */
export function unloads(
	{ model, scope }: Context,
	data: { readonly draft: Draft; readonly operations: Operations },
	by: string | Filter,
): boolean {
	const { draft, operations } = data
	if (updated(model) || nests(model, draft) || validates(model, operations)) {
		return false
	}
	const { access } = scope
	if (access === undefined) return true
	// The rules see relations resolved, and numbers computed on the row.
	const scalar = (name: string) => model.fields.get(name)?.kind === 'scalar'
	if (operations.size > 0 || !Object.keys(draft).every(scalar)) return false
	const where = typeof by === 'string' ? byId(by) : by
	return access.allowsUnloaded(model, 'update', {
		data: { ...draft },
		by: where,
	})
}

/**
 * Updates the row `by` finds, a locked check standing for its read, and
 * computes its numbers and lists in the write (D-99, D-132, D-149, D-341):
 * null when the row went between the check and the change (D-104), or
 * `absent` thrown when the check finds no row, and returned.
 */
export async function unloaded(
	context: Context,
	store: Store,
	commits: Commit[],
	data: { readonly draft: Draft; readonly operations: Operations },
	at: {
		readonly by: string | Filter
		readonly where: Filter
		readonly read: Nested
		readonly shape: Shape
	},
	absent?: PublicError,
): Promise<unknown> {
	const { model, caller, scope } = context
	const { draft, operations } = data
	const sent: Readonly<Draft> = { ...draft }
	await prepared(model, draft, caller, false)
	const { by } = at
	const steps = await updatePlan(
		scope,
		model,
		by,
		draft,
		sent,
		store,
		operations,
	)
	const check: Check = {
		model: model.name,
		where: at.where,
		count: 1,
		lock: 'update',
	}
	const message = missing(model.name)
	const checks: Checked[] = [
		{
			check,
			message,
			...(absent === undefined ? {} : { refuse: () => absent }),
		},
	]
	const to = {
		where: typeof by === 'string' ? byId(by) : by,
		read: at.read,
		shape: at.shape,
	}
	try {
		return await inRange(
			model,
			written(context, store, commits, steps, [], to, checks),
		)
	} catch (error) {
		if (absent !== undefined && error === absent) return absent
		throw error
	}
}

export async function update(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<unknown> {
	const { models, model } = context
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
	const { unique, where } = await targets(context, found, 'update')
	const by = unloadedBy(model, found.get('where'), unique, draft)
	const data = { draft, operations }
	if (by !== undefined && unloads(context, data, by)) {
		const result = await unloaded(context, store, commits, data, {
			by,
			where,
			read,
			shape,
		})
		// The row went between the write's check and its change (D-104).
		if (result === null) throw new PublicError('NOT_FOUND', missing(model.name))
		return result
	}
	const row = await target(context, store, where, 'update')
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
	const { unique, where } = await targets(context, found, 'delete')
	// Its relations, counts and virtuals, as the caller reads them, before
	// the delete removes any: one read in its transaction (D-135, D-151).
	const reaches =
		shape.relations.size > 0 ||
		shape.counts.length > 0 ||
		shape.virtuals.size > 0
	const shaped = async (by: Filter, lock: Lock | undefined) => {
		if (!reaches) return undefined
		const rows = await store.find({
			model: model.name,
			...read,
			where: by,
			take: 1,
			...(lock === undefined ? {} : { lock }),
		})
		return rows[0]
	}
	const reach = cascadeWhere(models, model, where)
	const hidden = hiddenBy(scope.access)
	const by = { by: unique }
	const allows = (access: Access) => access.allowsUnloaded(model, 'delete', by)
	if (
		reach !== undefined &&
		(scope.access === undefined || allows(scope.access))
	) {
		const kept = await shaped(where, 'delete')
		const computed = await computeVirtuals(
			context,
			store,
			kept === undefined ? [] : [kept],
			shape,
			hidden,
		)
		// Nothing needs the stored row: a check stands for its read, and the
		// write returns it as its delete removed it (D-102, D-104, D-342).
		const check: Check = { model: model.name, where, count: 1, lock: 'delete' }
		const checks: Checked[] = [{ check, message: missing(model.name) }]
		checks.push(...reach.checks, ...rowChecks(scope.access).before)
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
		return project(kept ?? rows[0], shape, hidden, computed)
	}
	const row = await target(context, store, where, 'delete')
	scope.access?.allow(model, 'delete', { record: row })
	const redirected = redirectOf(model) !== undefined
	// A redirected row stays: it is read as the redirect left it (D-89).
	const kept = redirected ? undefined : await shaped(byId(row.id), undefined)
	const before = redirected
		? undefined
		: await computeVirtuals(context, store, [kept ?? row], shape, hidden)
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
	const result = left ?? row
	const computed =
		before ?? (await computeVirtuals(context, store, [result], shape, hidden))
	return project(result, shape, hidden, computed)
}
