import { FrameworkError } from '../../foundation.js'

/** Hides whether one protected strict target was absent or inaccessible. */
export const createProtectedObjectNotFoundError = (): FrameworkError =>
	new FrameworkError(
		'NOT_FOUND',
		'Protected object target was missing or inaccessible.',
		{ publicMessage: 'The requested object was not found.' },
	)
