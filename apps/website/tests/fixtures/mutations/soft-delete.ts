import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const softDeletePost = (postId: string) =>
	ultimabase
		.schema(Post)
		.softDelete({ id: postId, select: { isDeleted: true, title: true } })

export const restorePost = (postId: string) =>
	ultimabase
		.schema(Post)
		.restore(
			{ id: postId, select: { isDeleted: true, title: true } },
			{ useMasterKey: true },
		)

export const purgePost = (postId: string) =>
	ultimabase
		.schema(Post)
		.purge({ id: postId, select: { title: true } }, { useMasterKey: true })
