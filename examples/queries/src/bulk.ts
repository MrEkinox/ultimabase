import { Post } from './schema.ts'

//#region create-and-update
export const createPostBatch = (
	posts: readonly { readonly slug: string; readonly title: string }[],
) =>
	Post.createMany({
		data: posts.map(({ slug, title }) => ({ slug, title })),
		select: { slug: true, title: true },
	})

export const renamePostBatch = (
	updates: readonly { readonly id: string; readonly title: string }[],
) =>
	Post.updateMany({
		data: updates.map(({ id, title }) => ({
			data: { title },
			where: { id: { eq: id } },
		})),
		select: { title: true },
	})
//#endregion create-and-update

//#region upsert-and-delete
export const upsertPostBatch = (
	posts: readonly { readonly slug: string; readonly title: string }[],
) =>
	Post.upsertMany({
		data: posts.map(({ slug, title }) => ({
			where: { slug: { eq: slug } },
			create: { slug, title },
			update: { title },
		})),
		select: { slug: true, title: true },
	})

export const deletePostBatch = (postIds: readonly string[]) =>
	Post.deleteMany({
		where: postIds.map((id) => ({ id: { eq: id } })),
		select: { slug: true, title: true },
	})
//#endregion upsert-and-delete
