// A plugin's own stored value in rows of another model, read and rewritten
// through the running adapter (D-366): no hook, no rule, no `beforeFind`,
// and `updatedAt` kept. The adapter feeds the write, so live reads see it.
import { isDeepStrictEqual } from 'node:util'
import type { Adapter, Row } from './adapter.ts'
import { byId } from './query-where.ts'
import { current } from './running.ts'

/** A row's stored field as read, and its rewrite while the row stays so. */
export type StoredField = {
	/** The field's stored value, as the field type's `decode` receives it. */
	readonly value: unknown
	/**
	 * Stores `value`, as the field type's `encode` gives it, unless the row
	 * was written or deleted since the read, or its field changed in the
	 * same millisecond; tells whether it stored it.
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
			const write = async (value: unknown): Promise<boolean> =>
				work.run(async () => guarded(adapter, model, field, row, value))
			return [row.id, { value: row[field], write }] as const
		}),
	)
}

/**
 * Stores `value` in the row's `field` while the row holds what was read:
 * its `updatedAt`, which every write sets, and its field, which a write in
 * the same millisecond may change. Both are read again under a row lock.
 */
async function guarded(
	adapter: Adapter,
	model: string,
	field: string,
	read: Row,
	value: unknown,
): Promise<boolean> {
	const where = byId(read.id)
	const tx = await adapter.begin()
	try {
		const fields = [field, 'updatedAt']
		const [row] = await tx.find({ model, where, fields, lock: 'update' })
		const same =
			row !== undefined &&
			fields.every((name) => isDeepStrictEqual(row[name], read[name]))
		if (same) {
			await tx.write({
				changes: [{ kind: 'update', model, where, set: { [field]: value } }],
			})
		}
		await tx.commit()
		return same
	} catch (error) {
		await tx.rollback().catch(() => undefined)
		throw error
	}
}
