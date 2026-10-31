// `createMany` (D-135): what a `create` runs, on each row of `data`, all or
// nothing; the rows go in one write (D-99). `createManyAndReturn` returns
// them in `data`'s order, each as `create` does (D-149).
import type { Change } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Event } from './hooks.ts'
import { rereads, runHook, settle, settles } from './hooks.ts'
import type { Plan as Shaped } from './query-args.ts'
import { oneKeys } from './query-args.ts'
import type { Context } from './query-context.ts'
import { given, shapedRows } from './query-context.ts'
import { byIds, entries, isObject } from './query-where.ts'
import { createPlan } from './query-write.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import { Plan } from './write-plan.ts'
import { guarded } from './write-target.ts'
import { writingOf } from './writing.ts'
import { returned } from './writes.ts'

/** A row's data, as `create` reads it, with no write but `connect` on a `one`. */
function rowData(context: Context, data: unknown, at: string): Draft {
	const { models, model } = context
	for (const [name, value] of entries(data, at)) {
		const field = model.fields.get(name)
		if (field === undefined || field.kind === 'scalar') continue
		const path = `${at}.${name}`
		if (field.kind === 'many') {
			throw new InvalidQuery(
				path,
				`${path} is a many relation, which createMany does not write.`,
			)
		}
		if (
			!isObject(value) ||
			Object.keys(value).some((key) => key !== 'connect')
		) {
			throw new InvalidQuery(path, `${path} takes only connect in createMany.`)
		}
	}
	return readData(models, model, data, true, at)
}

/**
 * Creates the rows of `data`: their ids, or with `at` the rows as it shapes
 * them, in `data`'s order. The rows come back even when a read rule would
 * hide them, as `create`'s does (D-86).
 */
async function created(
	context: Context,
	store: Store,
	commits: Commit[],
	data: unknown,
	at?: Shaped,
): Promise<readonly unknown[]> {
	const { model, caller, scope } = context
	const drafts = Array.isArray(data)
		? data.map((row: unknown, index) => rowData(context, row, `data.${index}`))
		: [rowData(context, data, 'data')]
	const sent: readonly Readonly<Draft>[] = drafts.map((draft) => ({ ...draft }))
	// One row refused, none written (D-111).
	for (const each of sent) scope.access?.allow(model, 'create', { data: each })
	if (drafts.length === 0) return []
	for (const draft of drafts) {
		await prepared(model, draft, caller, true)
		await runHook(model, 'beforeCreate', { caller, data: draft })
	}
	const events: Event[] = []
	const writing = writingOf(scope, store, events)
	const changes: Change[] = []
	const ids: string[] = []
	const plans: Plan[] = []
	const connects = new Plan()
	for (const [index, draft] of drafts.entries()) {
		const { id, plan } = await createPlan(
			scope,
			model,
			draft,
			sent[index] ?? {},
			store,
		)
		ids.push(id)
		events.push({ model, operation: 'create', id }, ...plan.events)
		connects.join(plan)
		plans.push(plan)
	}
	// A check per row would put thousands of counts in one statement.
	await connects.check(writing)
	for (const plan of plans) changes.push(...(await plan.changes(writing)))
	const read = at && { model: model.name, ...at.read, where: byIds(ids) }
	// An `after*` hook may change the rows: they are read once it ran (D-88).
	const again = rereads(events)
	const write = {
		checks: writing.checks.map(({ check }) => check),
		changes,
		...(read && !again && { read }),
	}
	// Nothing follows a write without hooks: it may need no transaction.
	const run = settles(events) ? store.write(write) : store.last(write)
	const rows = await guarded(run, writing.checks)
	await settle(store, caller, events, commits)
	if (at === undefined || read === undefined) return ids
	const found = new Map(
		(again ? await store.find(read) : rows).map((row) => [row.id, row]),
	)
	const ordered = ids.flatMap((id) => found.get(id) ?? [])
	return shapedRows(context, store, ordered, at.shape, scope.access)
}

export async function createMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const found = given(args, context.model.name, ['data'], ['data'])
	const ids = await created(context, store, commits, found.get('data'))
	return { count: ids.length }
}

export async function createManyAndReturn(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<readonly unknown[]> {
	const keys = ['data', ...oneKeys]
	const found = given(args, context.model.name, keys, ['data'])
	const at = await returned(context, found)
	return created(context, store, commits, found.get('data'), at)
}
