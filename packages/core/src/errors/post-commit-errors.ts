import type { MaybePromise } from '@ultimabase/shared'

import { readApplicationLog } from '../application/application-kernel-state.js'
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
		readApplicationLog().error(
			'UltimaBase logged a PublicError thrown after commit; it was not sent to the client',
			error,
		)
	}
}
