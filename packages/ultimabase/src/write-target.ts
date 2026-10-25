// The row a single-row write targets, read locked in the write's
// transaction, and the checks of its write (D-99, D-104).
import type { Filter, Row } from './adapter.ts'
import { CheckFailed, RelationViolation, UniqueViolation } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { Context } from './query-context.ts'
import type { Store } from './transaction.ts'
import type { Checked } from './write-plan.ts'

/** A relation the database refused, as the kernel's own checks word it. */
export function refused(error: RelationViolation): PublicError {
	const { model, field } = error
	return error.restricted
		? new PublicError(
				'RELATION_RESTRICTED',
				`${model}.${field} references a ${error.target} the delete removes.`,
				{ details: { model, field }, cause: error },
			)
		: new PublicError(
				'NOT_FOUND',
				`A connected ${error.target} does not exist.`,
				{ cause: error },
			)
}

export async function guarded(
	run: Promise<Row[]>,
	checks: readonly Checked[],
): Promise<Row[]> {
	try {
		return await run
	} catch (error) {
		const failed =
			error instanceof CheckFailed ? checks[error.index] : undefined
		if (failed?.restricted !== undefined) {
			throw new PublicError('RELATION_RESTRICTED', failed.message, {
				details: { ...failed.restricted },
				cause: error,
			})
		}
		if (failed !== undefined) {
			throw new PublicError('NOT_FOUND', failed.message, { cause: error })
		}
		if (error instanceof RelationViolation) throw refused(error)
		if (error instanceof UniqueViolation) {
			throw new PublicError('UNIQUE_VIOLATION', error.message, {
				details: { model: error.model, fields: [...error.fields] },
				cause: error,
			})
		}
		throw error
	}
}

/** The stored row a single-row write targets, locked (D-99, D-104). */
export async function target(
	context: Context,
	store: Store,
	where: Filter,
): Promise<Row> {
	const { model } = context
	const [row] = await store.find({
		model: model.name,
		where,
		take: 1,
		lock: true,
	})
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) {
		throw new PublicError('NOT_FOUND', `No ${model.name} matches.`)
	}
	return row
}
