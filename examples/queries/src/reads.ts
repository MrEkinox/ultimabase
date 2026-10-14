import type { Select, Where } from '@ultimabase/core'

import { Author, Comment, Post } from './schema.ts'

//#region published-posts
export const readPublishedPosts = () =>
	Post.findMany({
		take: 20,
		orderBy: { createdAt: 'desc', id: 'asc' },
		select: { createdAt: true, title: true },
		where: { published: true },
	})
//#endregion published-posts

//#region reusable-parts
const published: Where<typeof Post> = { published: true }
// A selection stays literal so the result type lists exactly its fields.
const summary = { createdAt: true, title: true } as const satisfies Select<
	typeof Post
>

export const readRecentPublishedPosts = () =>
	Post.findMany({
		orderBy: { createdAt: 'desc' },
		select: summary,
		take: 25,
		where: published,
	})
//#endregion reusable-parts

//#region discover
export const readDiscoverablePosts = () =>
	Post.findMany({
		where: {
			published: true,
			views: { between: { lower: 100, upper: 10_000 } },
			OR: [
				{ title: { contains: 'TypeScript' } },
				{ tags: { has: 'featured' } },
			],
			NOT: { title: { startsWith: 'Archive' } },
		},
	})
//#endregion discover

//#region drafts
export const readDrafts = (authorId: string) =>
	Post.findMany({
		where: { author: authorId, published: false, summary: null },
	})
//#endregion drafts

//#region structured
export const readPublicPosts = () =>
	Post.findMany({
		where: { metadata: { contains: { visibility: 'public' } } },
	})

export const readAuthorsByContact = (email: string) =>
	Author.findMany({
		where: { profile: { at: [{ path: ['contact', 'email'], eq: email }] } },
	})
//#endregion structured

//#region pointer-filter
export const readPostsOfVerifiedAuthor = (authorId: string) =>
	Post.findMany({
		where: {
			author: {
				eq: authorId,
				is: { verified: true },
			},
		},
	})
//#endregion pointer-filter

//#region dynamic-filter
export const readVisiblePosts = (minimumViews: number) => {
	const where: Where<typeof Post> = {
		published: true,
		views: { gte: minimumViews },
	}

	return Post.findMany({ where })
}
//#endregion dynamic-filter

//#region selections
const cardFields = { createdAt: true, title: true } as const

export const readPostCard = (id: string) =>
	Post.findOneOrThrow({ where: { id }, select: cardFields })

export const readPostsWithoutNotes = () =>
	Post.findMany({
		select: { internalNote: false },
		where: { published: { eq: true } },
	})
//#endregion selections

//#region post-page
const PAGE_SIZE = 25

export const readPostPage = async (after?: {
	readonly id: string
	readonly createdAt: string
}) => {
	const rows = await Post.findMany({
		orderBy: { createdAt: 'desc' },
		select: { id: true, createdAt: true, title: true },
		take: PAGE_SIZE + 1,
		...(after === undefined ? {} : { after }),
	})

	return {
		hasMore: rows.length > PAGE_SIZE,
		rows: rows.slice(0, PAGE_SIZE),
	}
}
//#endregion post-page

//#region batches
/** Reads every comment, 500 at a time, in `id` order. */
export const countCommentWords = async () => {
	let words = 0
	let after: Awaited<ReturnType<typeof Comment.findMany>>[number] | undefined
	do {
		const page = await Comment.findMany({
			take: 500,
			...(after ? { after } : {}),
		})
		for (const comment of page) words += comment.body.split(/\s+/u).length
		after = page.at(-1)
	} while (after)
	return words
}
//#endregion batches

//#region post-context
export const readPostsWithContext = () =>
	Post.findMany({
		include: {
			author: { select: { displayName: true } },
			comments: {
				take: 3,
				orderBy: { createdAt: 'desc', id: 'asc' },
				select: { body: true },
				where: { published: { eq: true } },
			},
		},
		select: { title: true },
	})
//#endregion post-context

//#region relation-filters
export const readEstablishedAuthors = () =>
	Author.findMany({
		where: {
			posts: {
				count: { gte: 3, where: { published: { eq: true } } },
				some: { published: { eq: true }, views: { gte: 80 } },
			},
		},
	})
//#endregion relation-filters
