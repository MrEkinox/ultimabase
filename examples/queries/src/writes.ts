import { Post, Translation } from './schema.ts'

//#region create-post
export const createPost = (authorId: string, slug: string, title: string) =>
	Post.createOne({
		data: {
			author: { connect: authorId },
			slug,
			title,
		},
		include: { author: { select: { displayName: true } } },
		select: { published: true, slug: true, title: true },
	})
//#endregion create-post

//#region rename-post
export const renamePost = (postId: string, title: string) =>
	Post.updateOne({
		where: { id: postId },
		data: { title },
		select: { title: true },
	})
//#endregion rename-post

//#region clear-summary
export const clearSummary = (postId: string) =>
	Post.updateOne({
		where: { id: postId },
		data: { summary: null, editCount: { increment: 1 } },
		select: { summary: true, editCount: true },
	})
//#endregion clear-summary

//#region delete-post
export const deletePost = (postId: string) =>
	Post.deleteOne({ where: { id: postId }, select: { slug: true, title: true } })
//#endregion delete-post

//#region delete-loaded-post
export const deleteLoadedPost = async (postId: string) => {
	const post = await Post.findOneOrThrow({ where: { id: postId } })
	return Post.deleteOne({ where: { id: post.id }, select: { title: true } })
}
//#endregion delete-loaded-post

//#region save-post
export const savePost = (slug: string, title: string) =>
	Post.upsertOne({
		where: { slug: { eq: slug } },
		create: { slug, title },
		update: { title },
		select: { slug: true, title: true },
	})
//#endregion save-post

//#region save-translation
export const saveTranslation = (
	postId: string,
	locale: string,
	title: string,
) =>
	Translation.upsertOne({
		where: { post: { eq: postId }, locale: { eq: locale } },
		create: { post: { connect: postId }, locale, title },
		update: { title },
		select: { locale: true, title: true },
	})
//#endregion save-translation
