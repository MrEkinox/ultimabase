import { Account, Post } from './schemas.js'
import { ultimabase } from './ultimabase.js'

export const createPostBatch = (
	authorId: string,
	posts: readonly { readonly slug: string; readonly title: string }[],
) =>
	Post.createMany(
		{
			data: posts.map((post) => ({
				author: Account.pointer(authorId),
				...post,
			})),
			select: { slug: true, title: true },
		},
		{ ultimabase },
	)

export const renamePostBatch = (
	updates: readonly { readonly id: string; readonly title: string }[],
) =>
	Post.updateMany(
		{
			data: updates.map(({ id, title }) => ({
				data: { title },
				where: { id: { eq: id } },
			})),
			select: { title: true },
		},
		{ ultimabase },
	)
