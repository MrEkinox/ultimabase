//#region read-for-job
import { RequestContext, requestSources } from '@ultimabase/core/plugin'

import { Post } from './schema.ts'

export const readPostsForJob = (requestId: string, signal: AbortSignal) => {
	const context = RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
		signal,
		metadata: { job: 'daily-report' },
	})

	return Post.findMany({ take: 20 }, { context })
}
//#endregion read-for-job
