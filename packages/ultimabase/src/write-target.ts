// The row a single-row write targets, read locked in the write's
// transaction, and the checks of its write (D-99, D-104).
import { and } from './access.ts'
import type { Change, Filter, Lock, Read, Row } from './adapter.ts'
import { CheckFailed, RelationViolation, UniqueViolation } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { ModelInfo } from './schema.ts'
import { uniqueWhere } from './query-args.ts'
import type { Context } from './query-context.ts'
import { planned } from './scope.ts'
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

/**
 * Writes `changes` after `checks`, each failed check its own error, then
 * reads `read`.
 */
export const checkedWrite = async (
	store: Store,
	checks: readonly Checked[],
	changes: readonly Change[],
	read?: Read,
): Promise<Row[]> =>
	guarded(
		store.write({
			checks: checks.map(({ check }) => check),
			changes,
			...(read && { read }),
		}),
		checks,
	)

export async function guarded(
	run: Promise<Row[]>,
	checks: readonly Checked[],
): Promise<Row[]> {
	try {
		return await run
	} catch (error) {
		const failed =
			error instanceof CheckFailed ? checks[error.index] : undefined
		if (failed?.refuse !== undefined) throw failed.refuse()
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
	lock: Lock,
): Promise<Row> {
	const { model } = context
	const [row] = await store.find({
		model: model.name,
		where,
		take: 1,
		lock,
	})
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) throw new PublicError('NOT_FOUND', missing(model.name))
	return row
}

export const missing = (model: string): string => `No ${model} matches.`

/**
 * The unique filter a single-row write names, and the rows it may target:
 * the caller reads them (D-72), and the `beforeFind` hooks let it
 * `operation` them (D-124).
 */
export async function targets(
	context: Context,
	found: ReadonlyMap<string, unknown>,
	operation: 'update' | 'delete',
): Promise<{ readonly unique: Filter; readonly where: Filter }> {
	const { models, model, scope } = context
	return planned(scope, () => {
		const given = found.get('where')
		const unique = uniqueWhere(models, model, given, 'where', scope)
		return { unique, where: and(unique, scope.readable(model.name, operation)) }
	})
}

/**
 * What an update that loads no row finds its row by: the `id` its `where`
 * names, or the unique filter of another unique when `draft` writes none
 * of its fields and no relation, so that it still finds the row after
 * the update (D-99, D-341).
 */
export function unloadedBy(
	model: ModelInfo,
	where: unknown,
	unique: Filter,
	draft: { readonly [field: string]: unknown },
): string | Filter | undefined {
	if (typeof where !== 'object' || where === null) return undefined
	if ('id' in where) return typeof where.id === 'string' ? where.id : undefined
	const named = new Set(Object.keys(where))
	const kept = Object.keys(draft).every(
		(name) => !named.has(name) && model.fields.get(name)?.kind === 'scalar',
	)
	return kept ? unique : undefined
}
