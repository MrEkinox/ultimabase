import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { readPostsWithContext } from '../src/reads.ts'
import { Author, Comment, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor } from './support.ts'

it('includes a pointer and a bounded, filtered relation', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await Post.createOne({
		data: {
			slug: 'with-comments',
			title: 'With comments',
			author: { connect: ada.id },
			comments: {
				create: [
					{ body: 'One' },
					{ body: 'Hidden', published: false },
					{ body: 'Two' },
					{ body: 'Three' },
					{ body: 'Four' },
				],
			},
		},
	})
	await Post.createOne({ data: { slug: 'alone', title: 'Alone' } })

	const posts = await readPostsWithContext()

	const withComments = posts.find(({ title }) => title === 'With comments')
	expect(Object.keys(withComments ?? {}).sort()).toStrictEqual([
		'author',
		'comments',
		'id',
		'title',
	])
	expect(withComments?.author).toStrictEqual({
		id: ada.id,
		displayName: ada.displayName,
	})
	// At most three published comments, each with `id` and `body`.
	expect(withComments?.comments).toHaveLength(3)
	expect(withComments?.comments.map(({ body }) => body)).not.toContain('Hidden')
	expect(Object.keys(withComments?.comments[0] ?? {}).sort()).toStrictEqual([
		'body',
		'id',
	])
	// An empty inclusion keeps its parent; a missing pointer is null.
	expect(posts.find(({ title }) => title === 'Alone')).toMatchObject({
		author: null,
		comments: [],
	})
})

it('pages an included relation with after', async () => {
	await testApplication(ultimabase)
	const { id } = await Post.createOne({
		data: {
			slug: 'paged',
			title: 'Paged',
			comments: { create: [{ body: 'A' }, { body: 'B' }, { body: 'C' }] },
		},
	})

	// Each post's comments are paged on their own, like a root `findMany`.
	const post = await Post.findOneOrThrow({
		where: { id },
		include: { comments: { orderBy: { body: 'asc' }, take: 2 } },
	})
	const last = post.comments.at(-1)
	const next = await Post.findOneOrThrow({
		where: { id },
		include: {
			comments: {
				orderBy: { body: 'asc' },
				take: 2,
				...(last === undefined ? {} : { after: last }),
			},
		},
	})

	expect(post.comments.map(({ body }) => body)).toStrictEqual(['A', 'B'])
	expect(next.comments.map(({ body }) => body)).toStrictEqual(['C'])
})

it('filters parents and included targets separately', async () => {
	await testApplication(ultimabase)
	const comment = await Comment.createOne({
		data: { body: 'Spam', published: false },
	})
	await Post.createOne({
		data: { slug: 'spam', title: 'Spam', comments: { connect: [comment.id] } },
	})
	await Post.createOne({ data: { slug: 'quiet', title: 'Quiet' } })

	//#region where-applies
	// Returns only the posts that have an unpublished comment.
	const flagged = await Post.findMany({
		where: { comments: { some: { published: false } } },
	})
	// Returns every post, each with only its published comments.
	const everyPost = await Post.findMany({
		include: { comments: { where: { published: true } } },
	})
	//#endregion where-applies

	expect(flagged.map(({ title }) => title)).toStrictEqual(['Spam'])
	expect(everyPost).toHaveLength(2)
	expect(everyPost.every(({ comments }) => comments.length === 0)).toBe(true)
})

it('shows readers published posts through the declared relation filter', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await createAuthor()
	await Post.createMany({
		data: [
			{
				slug: 'live',
				title: 'Live',
				published: true,
				author: { connect: ada.id },
			},
			{ slug: 'draft', title: 'Draft', author: { connect: ada.id } },
		],
	})

	//#region declared-filter
	const forReaders = await Author.findOneOrThrow({
		where: { id: ada.id },
		include: { posts: { select: { title: true } } },
	})
	const forMaster = await Author.findOneOrThrow(
		{ where: { id: ada.id }, include: { posts: { select: { title: true } } } },
		{ useMasterKey: true },
	)
	//#endregion declared-filter

	expect(forReaders.posts.map(({ title }) => title)).toStrictEqual(['Live'])
	expect(forMaster.posts.map(({ title }) => title).sort()).toStrictEqual([
		'Draft',
		'Live',
	])
	// Relation predicates see the same visible universe.
	expect(
		await Author.count({ where: { posts: { some: { published: false } } } }),
	).toBe(0)
	expect(
		await t.asMaster(() =>
			Author.count({ where: { posts: { some: { published: false } } } }),
		),
	).toBe(1)
})
