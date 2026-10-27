// `createMany` (D-135): what a `create` runs, on each row of `data`, all or
// nothing; the rows go in one write (D-99).
import type { Change } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Event } from './hooks.ts'
import { runHook, settle, settles } from './hooks.ts'
import type { Context } from './query-context.ts'
import { given } from './query-context.ts'
import { entries, isObject } from './query-where.ts'
import { createPlan, updatePlan } from './query-write.ts'
import type { Commit, Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Writing } from './write-plan.ts'
import { guarded } from './write-target.ts'

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

export async function createMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const { model, caller, scope } = context
	const found = given(args, model.name, ['data'], ['data'])
	const data = found.get('data')
	const drafts = Array.isArray(data)
		? data.map((row: unknown, index) => rowData(context, row, `data.${index}`))
		: [rowData(context, data, 'data')]
	const sent: readonly Readonly<Draft>[] = drafts.map((draft) => ({ ...draft }))
	// One row refused, none written (D-111).
	for (const each of sent) scope.access?.allow(model, 'create', { data: each })
	if (drafts.length === 0) return { count: 0 }
	for (const draft of drafts) {
		await prepared(model, draft, caller, true)
		await runHook(model, 'beforeCreate', { caller, data: draft })
	}
	const events: Event[] = []
	const writing: Writing = {
		store,
		scope,
		events,
		checks: [],
		replan: async (moving, id, moved) =>
			updatePlan(scope, moving, id, moved, {}, store),
	}
	const changes: Change[] = []
	for (const [index, draft] of drafts.entries()) {
		const { id, plan } = await createPlan(
			scope,
			model,
			draft,
			sent[index] ?? {},
			store,
		)
		events.push({ model, operation: 'create', id }, ...plan.events)
		await plan.check(writing)
		changes.push(...(await plan.changes(writing)))
	}
	const write = { checks: writing.checks.map(({ check }) => check), changes }
	// Nothing follows a write without hooks: it may need no transaction.
	const run = settles(events) ? store.write(write) : store.last(write)
	await guarded(run, writing.checks)
	await settle(store, caller, events, commits)
	return { count: drafts.length }
}
