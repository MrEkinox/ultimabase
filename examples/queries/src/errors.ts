import { FrameworkError } from '@ultimabase/core'

import { Post } from './schema.ts'

//#region find-post-or-null
export const findPostOrNull = async (postId: string) => {
	try {
		return await Post.findOneOrThrow({ where: { id: postId } })
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'NOT_FOUND') {
			return null
		}
		throw error
	}
}
//#endregion find-post-or-null
