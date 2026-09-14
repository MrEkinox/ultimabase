import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readDiscoverablePosts = () =>
	Post.findMany(
		{
			where: {
				NOT: { title: { startsWith: 'Archive' } },
				OR: [{ score: { gte: 80 } }, { tags: { has: 'featured' } }],
				published: { eq: true },
				views: { between: { lower: 100, upper: 10_000 } },
			},
		},
		{ ultimabase },
	)
