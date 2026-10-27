// `deleteMany` (D-111): what a `delete` runs, on each row its `where`
// selects, all or nothing; one write when nothing runs (D-102).
import type { Filter } from './adapter.ts'
import { cascadeOf, cascadeWhere } from './cascade.ts'
import type { Event } from './hooks.ts'
import { redirectOf, settle } from './hooks.ts'
import type { Context } from './query-context.ts'
import { filtered, given } from './query-context.ts'
import type { Commit, Store } from './transaction.ts'
import { guarded } from './write-target.ts'
import { cascaded, writingOf } from './writing.ts'

export async function removeMany(
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
): Promise<{ readonly count: number }> {
	const { models, model, caller, scope } = context
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
	if (rows.length === 0) return { count: 0 }
	const count = rows.length
	const ids = { id: { in: rows.map((row) => row.id) } }
	const locked = cascadeWhere(models, model, ids)
	if (locked !== undefined) {
		const checks = locked.checks.map(({ check }) => check)
		await guarded(
			store.write({ checks, changes: locked.changes }),
			locked.checks,
		)
		return { count }
	}
	const redirected = redirectOf(model) !== undefined
	// A redirected row stays: it cascades nothing (D-90).
	const cascade = redirected
		? { deleted: rows.map((row) => ({ model, row, redirected })), nulled: [] }
		: await cascadeOf(models, model, rows, store)
	const events: Event[] = []
	const writing = writingOf(scope, store, events)
	const changes = await cascaded(writing, cascade)
	if (changes.length > 0) {
		const checks = writing.checks.map(({ check }) => check)
		await guarded(store.write({ checks, changes }), writing.checks)
	}
	await settle(store, caller, events, commits)
	return { count }
}
