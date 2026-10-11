import { isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'

/** Describes the row whose plugin command wrote a now-duplicated unique value. */
export interface SchemaMutationConflictTarget {
	readonly className: string
	readonly command: string
	readonly id: string
	readonly original: Readonly<Record<string, unknown>>
}

/**
 * Rewords a unique violation raised by a plugin command, such as restoring a
 * soft-deleted row whose slug another row took meanwhile (ADR-0316). The
 * message names the command, the row and the fields; field values stay in
 * the internal details, since field read rules may hide them from the caller.
 */
export const describeSchemaMutationConflict = (
	error: unknown,
	target: SchemaMutationConflictTarget,
): unknown => {
	if (!(error instanceof FrameworkError) || error.code !== 'UNIQUE_VIOLATION') {
		return error
	}
	const details: unknown = error.publicDetails
	const fields =
		isPlainRecord(details) &&
		Array.isArray(details.fields) &&
		details.fields.every((field) => typeof field === 'string')
			? details.fields.map(String)
			: []
	const subject = fields.length === 0 ? 'a unique value' : fields.join(', ')
	return new FrameworkError(
		'UNIQUE_VIOLATION',
		`Schema mutation ${target.command} would duplicate a unique value.`,
		{
			cause: error,
			publicMessage: `Cannot run ${target.command} on ${target.className} ${target.id}: ${subject} is now used by another row.`,
			...(error.publicDetails === undefined
				? {}
				: { publicDetails: error.publicDetails }),
			internalDetails: {
				command: target.command,
				values: Object.fromEntries(
					fields.map((field) => [field, target.original[field]]),
				),
			},
		},
	)
}
