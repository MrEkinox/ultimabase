import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const readPostCard = (id: string) =>
	Post.get({ id, select: { createdAt: true, title: true } }, { ultimabase })

export const readPostSignals = () =>
	Promise.all([
		Post.findOne(
			{
				orderBy: { createdAt: 'desc' },
				select: { title: true },
				where: { published: { eq: true } },
			},
			{ ultimabase },
		),
		Post.count({ where: { published: { eq: true } } }, { ultimabase }),
		Post.exists({ where: { published: { eq: false } } }, { ultimabase }),
	])
