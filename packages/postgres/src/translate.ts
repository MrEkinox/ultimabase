// A database refusal as the kernel's error: a unique constraint's as
// `UniqueViolation` (D-98), a foreign key's as `RelationViolation` (D-99), a
// conflict as `Conflict` (D-179), a check of the application's own as
// `VALIDATION_FAILED` (D-219).
import {
	Conflict,
	PublicError,
	RelationViolation,
	UniqueViolation,
} from 'ultimabase'
import type { Catalog } from './names.ts'

type Refusal = {
	readonly code: string
	readonly constraint: string
	readonly message: string
}

function isRefusal(error: unknown): error is Refusal {
	return (
		error instanceof Error &&
		'code' in error &&
		typeof error.code === 'string' &&
		'constraint' in error &&
		typeof error.constraint === 'string'
	)
}

/** A serialization failure or a deadlock (D-179). */
const conflicts = new Set(['40001', '40P01'])

/** A constraint's refusal or a conflict as the kernel's error; any other as is. */
export function translate(catalog: Catalog, error: unknown): unknown {
	if (
		error instanceof Error &&
		'code' in error &&
		typeof error.code === 'string' &&
		conflicts.has(error.code)
	) {
		return new Conflict({ cause: error })
	}
	if (!isRefusal(error)) return error
	if (error.code === '23505') {
		const unique = catalog.uniques.get(error.constraint)
		if (unique !== undefined) {
			return new UniqueViolation(unique.model, unique.fields)
		}
	}
	const key = catalog.foreignKeys.get(error.constraint)
	if (error.code === '23503' && key !== undefined) {
		// Only the message tells the deleting side from the linking one.
		const restricted = error.message.startsWith('update or delete')
		return new RelationViolation(key.model, key.field, key.target, restricted)
	}
	// UltimaBase writes no check of its own on a model's table (D-219).
	if (error.code === '23514') {
		const message = `The row breaks the check ${error.constraint}.`
		return new PublicError('VALIDATION_FAILED', 'Invalid data.', {
			details: { issues: [{ path: [], message }] },
			cause: error,
		})
	}
	return error
}
