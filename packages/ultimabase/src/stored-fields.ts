// A plugin's own stored value in rows of another model, read and rewritten
// through the running adapter (D-366): no hook, no rule, no `beforeFind`,
// and `updatedAt` kept. The adapter feeds the write, so live reads see it.
import { CheckFailed } from './adapter-errors.ts'
import type { Filter } from './adapter.ts'
import { byId } from './query-where.ts'
import { current } from './running.ts'

/** A row's stored field as read, and its rewrite while the row stays so. */
export type StoredField = {
	/** The field's stored value, as the field type's `decode` receives it. */
	readonly value: unknown
	/**
	 * Stores `value`, as the field type's `encode` gives it, unless the row
	 * was written or deleted since the read; tells whether it stored it.
	 */
	readonly write: (value: unknown) => Promise<boolean>
}

/** The stored `field` of the rows of `model` among `ids`, by id. */
export async function storedFields(
	model: string,
	field: string,
	ids: readonly string[],
): Promise<ReadonlyMap<string, StoredField>> {
	const app = current()
	if (app === undefined) throw new Error('No application is running.')
	const { adapter, work } = app
	if (ids.length === 0) return new Map()
	const rows = await work.run(async () =>
		adapter.find({
			model,
			where: { id: { in: ids } },
			fields: [field, 'updatedAt'],
		}),
	)
	return new Map(
		rows.map((row) => {
			// Every write of the row sets `updatedAt`; this one keeps it.
			const where: Filter = {
				...byId(row.id),
				updatedAt: { equals: row['updatedAt'] },
			}
			const write = async (value: unknown): Promise<boolean> => {
				const check = { model, where, count: 1, lock: 'update' } as const
				const set = { [field]: value }
				try {
					await work.run(async () =>
						adapter.write({
							checks: [check],
							changes: [{ kind: 'update', model, where, set }],
						}),
					)
					return true
				} catch (error) {
					if (error instanceof CheckFailed) return false
					throw error
				}
			}
			return [row.id, { value: row[field], write }] as const
		}),
	)
}
