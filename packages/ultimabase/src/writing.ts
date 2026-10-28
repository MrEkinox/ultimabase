// What one write's changes are made in (write-plan.ts): the rows a move's
// hooks update planned again, and deletes run with their cascade and hooks
// (D-88, D-90, D-138).
import { recordOf } from './access.ts'
import type { Change } from './adapter.ts'
import type { Cascade } from './cascade.ts'
import { cascadeOf } from './cascade.ts'
import { InvalidQuery } from './errors.ts'
import type { Event } from './hooks.ts'
import { redirectOf, runHook } from './hooks.ts'
import { updatePlan } from './query-write.ts'
import type { QueryScope } from './scope.ts'
import type { Store } from './transaction.ts'
import type { Checked, Drop, Writing } from './write-plan.ts'
import { moved } from './write-plan.ts'
import { modelOf } from './query-where.ts'

/** The changes and events of a delete's cascade, its hooks run (D-90). */
export async function cascaded(
	writing: Writing,
	cascade: Cascade,
): Promise<Change[]> {
	const { caller } = writing.scope
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

/**
 * A nested delete as `Target.delete` runs it: a plugin's redirect, or the
 * cascade, which may not reach a row the write updates (D-138).
 */
async function dropped(writing: Writing, step: Drop): Promise<Change[]> {
	const { scope, store } = writing
	const model = modelOf(scope.models, step.model)
	const cascade = await cascadeOf(
		scope.models,
		model,
		step.rows,
		store,
		step.except,
	)
	const reached = cascade.deleted.some(({ model: from, row }) =>
		step.written.has(`${from.name}:${row.id}`),
	)
	if (reached) {
		throw new InvalidQuery(
			step.path,
			`${step.path} deletes a row the write updates.`,
		)
	}
	return cascaded(writing, cascade)
}

export function writingOf(
	scope: QueryScope,
	store: Store,
	events: Event[],
	checks: Checked[] = [],
): Writing {
	const writing: Writing = {
		store,
		scope,
		events,
		checks,
		replan: async (model, id, draft) =>
			updatePlan(scope, model, id, draft, {}, store),
		drop: async (step) => dropped(writing, step),
	}
	return writing
}
