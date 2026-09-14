import { Author, Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readEstablishedAuthors = () =>
	Author.findMany(
		{
			where: {
				posts: {
					count: {
						gte: 3,
						where: { published: { eq: true } },
					},
					some: { score: { gte: 80 } },
				},
			},
		},
		{ ultimabase },
	)

export const readPostsWithoutComments = () =>
	Post.findMany({ where: { comments: { isEmpty: true } } }, { ultimabase })
