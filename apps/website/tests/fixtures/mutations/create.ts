import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const createPost = (authorId: string) =>
	Post.createOne(
		{
			data: {
				author: { connect: authorId },
				slug: 'first-post',
				title: 'First post',
			},
			include: { author: { select: { displayName: true } } },
			select: { slug: true, title: true },
		},
		{ ultimabase },
	)
