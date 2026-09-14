import { Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const createPostGraph = (existingCommentId: string) =>
	Post.createOne(
		{
			data: {
				author: {
					create: {
						displayName: 'Ada',
						email: 'ada@example.com',
					},
				},
				comments: {
					connect: [existingCommentId],
					create: [{ body: 'First' }, { body: 'Second' }],
				},
				slug: 'nested-post',
				title: 'Nested post',
			},
			include: {
				author: { select: { displayName: true } },
				comments: { select: { body: true } },
			},
		},
		{ ultimabase },
	)

export const revisePostGraph = (
	postId: string,
	commentId: string,
	oldCommentId: string,
) =>
	Post.updateOne(
		{
			data: {
				author: { update: { displayName: 'Ada Lovelace' } },
				comments: {
					create: [{ body: 'Third' }],
					disconnect: [oldCommentId],
					update: [{ data: { body: 'Edited' }, id: commentId }],
				},
			},
			id: postId,
		},
		{ ultimabase },
	)
