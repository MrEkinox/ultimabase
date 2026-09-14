import { increment, unset } from '@ultimabase/core'

import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const publishPost = (postId: string) =>
	Post.updateOne(
		{
			data: {
				summary: unset(),
				title: 'Published',
				views: increment(1),
			},
			id: postId,
			select: { title: true, views: true },
		},
		{ ultimabase },
	)
