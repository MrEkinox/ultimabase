// `deleteMany` (D-111): what a `delete` runs, on each row its `where`
// selects, all or nothing; one write when nothing runs (D-102).
import type { Filter, Row } from './adapter.ts'
import { cascadeOf, cascadeWhere } from './cascade.ts'
import type { Event } from './hooks.ts'
import { settle } from './hooks.ts'
import type { Context } from './query-context.ts'
import { filtered, given } from './query-context.ts'
import { byIds } from './query-where.ts'
import type { Commit, Store } from './transaction.ts'
import { checkedWrite, guarded } from './write-target.ts'
import { cascaded, writingOf } from './writing.ts'

export async function removeMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const { models, model, scope } = context
	const found = given(args, model.name, ['where'], [])
	const where: Filter = (await filtered(context, found, 'delete')) ?? {}
	const reach = cascadeWhere(models, model, where)
	if (reach !== undefined && scope.access === undefined) {
		// The write reads its rows as they were, to count them (D-102).
		const read = { model: model.name, where }
		const { checks } = reach
		const rows = await guarded(
			store.last({
				checks: checks.map(({ check }) => check),
				changes: reach.changes,
				read,
				before: true,
			}),
			checks,
		)
		return { count: rows.length }
	}
	// In id order, so two calls on the same rows wait instead of deadlocking.
	const orderBy = [{ field: 'id', direction: 'asc' }] as const
	const rows = await store.find({
		model: model.name,
		where,
		orderBy,
		lock: true,
	})
	// One row refused, none deleted (D-111).
	for (const row of rows) scope.access?.allow(model, 'delete', { record: row })
	if (rows.length > 0) await deleted(context, store, commits, rows)
	return { count: rows.length }
}

/**
 * Deletes `rows`, which the caller may delete, as `delete` does: in one write
 * when nothing runs (D-102), else with their cascade or redirect, then the
 * hooks.
 */
export async function deleted(
	context: Context,
	store: Store,
	commits: Commit[],
	rows: readonly Row[],
): Promise<void> {
	const { models, model, caller, scope } = context
	const locked = cascadeWhere(models, model, byIds(rows.map(({ id }) => id)))
	if (locked !== undefined) {
		await checkedWrite(store, locked.checks, locked.changes)
		return
	}
	const events: Event[] = []
	const writing = writingOf(scope, store, events)
	const cascade = await cascadeOf(models, model, rows, store)
	const changes = await cascaded(writing, cascade)
	if (changes.length > 0) await checkedWrite(store, writing.checks, changes)
	await settle(store, caller, events, commits)
}
