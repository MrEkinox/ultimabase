import { FrameworkError } from '@ultimabase/core'

import { Author, Post } from './schema.ts'
import { ultimabase } from './ultimabase.ts'

//#region publish
export const createPostAndRenameAuthor = (
	authorId: string,
	slug: string,
	title: string,
) =>
	ultimabase.transaction(async () => {
		const post = await Post.createOne({
			data: { author: { connect: authorId }, slug, title },
		})

		const updatedAuthor = await Author.updateOne({
			data: { displayName: 'Published author' },
			where: { id: authorId },
		})
		if (updatedAuthor === null) {
			throw new Error('Author is no longer available for update')
		}

		return post
	})
//#endregion publish

//#region retry
export const runWithRetry = async <TResult>(
	work: () => Promise<TResult>,
): Promise<TResult> => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await ultimabase.transaction(work)
		} catch (error: unknown) {
			const conflict =
				error instanceof FrameworkError && error.code === 'TRANSACTION_CONFLICT'
			if (!conflict || attempt === 3) throw error
		}
	}
}
//#endregion retry
