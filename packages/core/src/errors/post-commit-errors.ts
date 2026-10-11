import type { MaybePromise } from '@ultimabase/shared'

import { readApplicationLog } from '../application/application-kernel-state.js'

/** Names one post-commit effect in its failure log line, never its values. */
export interface PostCommitEffectIdentity {
	/** The request whose committed write the effect follows. */
	readonly requestId?: string
	/** What failed, for example `the postCommit stage of @acme/audit`. */
	readonly source: string
}

/**
 * Runs one post-commit effect. After commit nothing can be rolled back and the
 * client already has its answer, so any failure (a `PublicError` included) is
 * logged at `error` level and never rejects the call nor stops the remaining
 * effects (ADR-0305, ADR-0318 amendment).
 */
export const runPostCommitEffect = async (
	effect: () => MaybePromise<void>,
	identity: PostCommitEffectIdentity,
): Promise<void> => {
	try {
		await effect()
	} catch (error: unknown) {
		const request =
			identity.requestId === undefined ? '' : ` (request ${identity.requestId})`
		readApplicationLog().error(
			`UltimaBase: ${identity.source} failed after commit${request}; the committed write is kept and the call is not rejected`,
			error instanceof Error ? error : { error },
		)
	}
}
