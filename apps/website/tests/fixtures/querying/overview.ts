import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readPublishedPosts = () =>
	Post.findMany(
		{
			limit: 20,
			orderBy: { createdAt: 'desc', id: 'asc' },
			select: { createdAt: true, title: true },
			where: { published: { eq: true } },
		},
		{ ultimabase },
	)
