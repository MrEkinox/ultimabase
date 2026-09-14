import { requestSources } from '@ultimabase/core'

import { Account, Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const createPostAndRenameAuthor = (
	authorId: string,
	slug: string,
	title: string,
) => {
	const request = ultimabase.engine.anonymous({
		requestId: `publish:${slug}`,
		source: requestSources.internal,
	})

	return request.transaction(async () => {
		const post = await Post.createOne({
			data: { author: { connect: authorId }, slug, title },
		})

		await Account.updateOne({
			data: { displayName: 'Published author' },
			id: authorId,
		})

		return post
	})
}
