import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readPostsWithContext = () =>
	Post.findMany(
		{
			include: {
				author: { select: { name: true } },
				comments: {
					limit: 3,
					orderBy: { createdAt: 'desc' },
					select: { body: true },
					where: { published: { eq: true } },
				},
			},
			select: { title: true },
		},
		{ ultimabase },
	)
