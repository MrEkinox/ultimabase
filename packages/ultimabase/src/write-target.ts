// The row a single-row write targets and the checks of its write: read
// locked in the write's transaction, or alone and checked unchanged (D-99,
// D-104).
import type { Condition, Filter, Read, Row } from './adapter.ts'
import { and } from './access.ts'
import { CheckFailed, UniqueViolation } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { Context } from './query-context.ts'
import { isObject } from './query-where.ts'
import type { ModelInfo } from './schema.ts'
import type { Store } from './transaction.ts'
import type { Checked } from './write-plan.ts'

/** A row read without a lock changed before the write: it starts over. */
export class Stale extends Error {}

export async function guarded(
	run: Promise<Row[]>,
	checks: readonly Checked[],
): Promise<Row[]> {
	try {
		return await run
	} catch (error) {
		const failed =
			error instanceof CheckFailed ? checks[error.index] : undefined
		if (failed?.stale === true)
			throw new Stale(failed.message, { cause: error })
		if (failed?.restricted !== undefined) {
			throw new PublicError('RELATION_RESTRICTED', failed.message, {
				details: { ...failed.restricted },
				cause: error,
			})
		}
		if (failed !== undefined) {
			throw new PublicError('NOT_FOUND', failed.message, { cause: error })
		}
		if (error instanceof UniqueViolation) {
			throw new PublicError('UNIQUE_VIOLATION', error.message, {
				details: { model: error.model, fields: [...error.fields] },
				cause: error,
			})
		}
		throw error
	}
}

/** The stored row a single-row write targets, through `find`. */
export async function target(
	context: Context,
	find: (read: Read) => Promise<Row[]>,
	where: Filter,
	lock: boolean,
): Promise<Row> {
	const { model } = context
	const [row] = await find({ model: model.name, where, take: 1, lock })
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) {
		throw new PublicError('NOT_FOUND', `No ${model.name} matches.`)
	}
	return row
}

/** Reads in the write's transaction. */
export const transacted =
	(store: Store) =>
	async (read: Read): Promise<Row[]> =>
		store.find(read)

/**
 * The check that `row`, read without a lock, still holds the record the
 * rules decided from: each of its fields, since two writes in one
 * millisecond leave `updatedAt` as it was (D-104).
 */
export function unchanged(model: ModelInfo, where: Filter, row: Row): Checked {
	const record: { [field: string]: Condition } = {
		id: { equals: row.id },
		createdAt: { equals: row['createdAt'] },
		updatedAt: { equals: row['updatedAt'] },
	}
	for (const field of model.fields.values()) {
		const value = row[field.name]
		if (field.kind === 'scalar') record[field.name] = { equals: value ?? null }
		else if (field.kind === 'one' && field.stored) {
			const key = isObject(value) ? { id: { equals: value['id'] } } : null
			record[field.name] = { is: key }
		}
	}
	const check = { model: model.name, where: and(where, record), count: 1 }
	return { check, message: `No ${model.name} matches.`, stale: true }
}
