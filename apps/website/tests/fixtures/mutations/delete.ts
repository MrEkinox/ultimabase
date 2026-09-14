import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const deletePost = (postId: string) =>
	Post.deleteOne(
		{ id: postId, select: { slug: true, title: true } },
		{ ultimabase },
	)

export const deleteLoadedPost = async (postId: string) => {
	const post = await Post.get({ id: postId }, { ultimabase })
	return post.delete({ select: { title: true } }, { ultimabase })
}
