import { increment } from '@ultimabase/core'

import { Account, Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const importPost = (authorId: string, slug: string, title: string) =>
	Post.upsertOne(
		{
			create: {
				author: Account.pointer(authorId),
				slug,
				title,
			},
			select: { slug: true, title: true, views: true },
			update: { title, views: increment(1) },
			where: { slug: { eq: slug } },
		},
		{ ultimabase },
	)
