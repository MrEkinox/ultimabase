import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readPostPage = (page: number) =>
	Post.findMany(
		{
			limit: 25,
			offset: page * 25,
			orderBy: { createdAt: 'desc', id: 'asc' },
			select: { createdAt: true, title: true },
		},
		{ ultimabase },
	)
