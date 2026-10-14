import { Post } from './schema.ts'

//#region create-graph
export const createPostGraph = (existingCommentId: string) =>
	Post.createOne({
		data: {
			author: {
				create: {
					displayName: 'Ada',
					email: 'ada@example.com',
				},
			},
			comments: {
				create: [{ body: 'First' }, { body: 'Second' }],
				connect: [existingCommentId],
			},
			slug: 'nested-post',
			title: 'Nested post',
		},
		include: {
			author: { select: { displayName: true } },
			comments: { select: { body: true } },
		},
	})
//#endregion create-graph

//#region revise-graph
export const revisePostGraph = (
	postId: string,
	commentId: string,
	oldCommentId: string,
) =>
	Post.updateOne({
		data: {
			author: { update: { displayName: 'Ada Lovelace' } },
			comments: {
				create: [{ body: 'Third' }],
				update: [{ data: { body: 'Edited' }, id: commentId }],
				disconnect: [oldCommentId],
			},
		},
		where: { id: postId },
	})
//#endregion revise-graph

//#region replace-links
/** Replaces the visible comments and unlinks the optional author. */
export const detachPost = (postId: string, keptCommentIds: readonly string[]) =>
	Post.updateOne({
		where: { id: postId },
		data: { author: null, comments: { set: [...keptCommentIds] } },
		select: { author: true },
		include: { comments: { select: { body: true } } },
	})
//#endregion replace-links
