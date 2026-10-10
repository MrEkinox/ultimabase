import type { MaybePromise } from '@ultimabase/shared'

import { PublicError } from './public-error.js'

/**
 * Runs one post-commit effect. After commit nothing can be rolled back and the
 * client already has its answer, so a `PublicError` is only logged (ADR-0305);
 * other failures keep propagating to the caller.
 */
export const runPostCommitEffect = async (
	effect: () => MaybePromise<void>,
): Promise<void> => {
	try {
		await effect()
	} catch (error: unknown) {
		if (!(error instanceof PublicError)) throw error
		// Temporary sink until the application logger of ADR-0313 exists.
		console.error(
			'[UltimaBase] A PublicError thrown after commit was logged, not sent to the client',
			error,
		)
	}
}
