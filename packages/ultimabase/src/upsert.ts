// `upsert`: the update of the row its `where` finds, or the create of it
// (D-142); without a stored row to load, a check stands for its read (D-341).
import { PublicError } from './errors.ts'
import { given } from './query-context.ts'
import { oneKeys } from './query-args.ts'
import type { ModelInfo } from './schema.ts'
import { operationsOf } from './number-update.ts'
import type { Commit, Store } from './transaction.ts'
import type { Context } from './query-context.ts'
import type { Draft } from './write-data.ts'
import { issueOf, readData } from './write-data.ts'
import { missing, targets, unloadedBy } from './write-target.ts'
import { creating, returned, unloaded, unloads, updating } from './writes.ts'

/**
 * Whether checking the update data before its row is found could refuse it
 * or run code: a value that does not fit its field, a `validate` or a plugin
 * schema. Only the update checks it (D-142).
 */
const checks = (model: ModelInfo, draft: Draft): boolean =>
	Object.entries(draft).some(([name, value]) => {
		const field = model.fields.get(name)
		if (field?.kind !== 'scalar' || value === null) return false
		return (
			field.codec !== undefined ||
			field.options['validate'] !== undefined ||
			issueOf(value, field) !== undefined
		)
	})

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
	const returnedAt = await returned(context, found)
	// Both data are checked, whichever runs.
	const creation = readData(models, model, found.get('create'), true)
	const draft = readData(models, model, found.get('update'), false)
	const operations = operationsOf(model, draft)
	const { unique, where } = await targets(context, found, 'update')
	const data = { draft, operations }
	const by = unloadedBy(model, found.get('where'), unique, draft)
	// A missing row costs a failed check, then the create.
	if (by !== undefined && unloads(context, data) && !checks(model, draft)) {
		const absent = new PublicError('NOT_FOUND', missing(model.name))
		const at = { by, where, ...returnedAt }
		const changed = await unloaded(context, store, commits, data, at, absent)
		if (changed !== absent && changed !== null) {
			return { row: changed, created: false }
		}
		// Another create of the row meanwhile fails on its unique index.
		const row = await creating(context, store, commits, creation, returnedAt)
		return { row, created: true }
	}
	const [row] = await store.find({
		model: model.name,
		where,
		take: 1,
		lock: 'update',
	})
	// Another create of the row meanwhile fails on its unique index.
	if (row === undefined) {
		return {
			row: await creating(context, store, commits, creation, returnedAt),
			created: true,
		}
	}
	const at = { row, ...returnedAt }
	const changed = await updating(context, store, commits, data, at)
	return { row: changed, created: false }
}
