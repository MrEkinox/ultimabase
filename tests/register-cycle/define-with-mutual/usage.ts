import { Comment } from './comment.ts'
import { Post } from './post.ts'

export const posts = await Post.findMany({
	include: {
		fans: { select: { name: true } },
		comments: { select: { body: true } },
	},
})
export const replies = await Comment.findMany({
	include: { replies: { select: { body: true } } },
})
export const fanName: string | undefined = posts[0]?.fans[0]?.name
