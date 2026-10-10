import { FrameworkError } from '../../foundation.js'

/** Hides whether one protected strict target was absent or inaccessible. */
export const createProtectedObjectNotFoundError = (): FrameworkError =>
	new FrameworkError(
		'NOT_FOUND',
		'Protected object target was missing or inaccessible.',
		{ publicMessage: 'The requested object was not found.' },
	)

/**
 * Reports a `connect`, `set` or `disconnect` target that is missing or hidden
 * from the caller, naming the field and target schema; both cases are
 * indistinguishable (ADR-0308).
 */
export const createLinkTargetNotFoundError = (
	field: string,
	target: string,
): FrameworkError =>
	new FrameworkError(
		'NOT_FOUND',
		`Link target ${target} of ${field} was missing or inaccessible.`,
		{
			publicDetails: { field, schema: target },
			publicMessage: `The ${target} linked by ${field} was not found.`,
		},
	)

/** Names the field and target schema of a link target that was not found. */
export const withLinkTargetNotFound = async <TResult>(
	field: string,
	target: string,
	run: () => Promise<TResult>,
): Promise<TResult> => {
	try {
		return await run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'NOT_FOUND') {
			throw createLinkTargetNotFoundError(field, target)
		}
		throw error
	}
}
