import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import {
	readAuthorsByContact,
	readDiscoverablePosts,
	readDrafts,
	readEstablishedAuthors,
	readPostsOfVerifiedAuthor,
	readPublicPosts,
	readVisiblePosts,
} from '../src/reads.ts'
import { Author, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createPosts } from './support.ts'

const titles = (rows: readonly { readonly title: string }[]) =>
	rows.map(({ title }) => title).sort()

it('combines operators, OR and NOT', async () => {
	await testApplication(ultimabase)
	await createPosts([
		{ title: 'TypeScript tips', published: true, views: 100 },
		{
			title: 'Featured story',
			published: true,
			views: 10_000,
			tags: ['featured'],
		},
		{ title: 'Archive of TypeScript', published: true, views: 500 },
		{ title: 'TypeScript draft', views: 500 },
		{ title: 'TypeScript hit', published: true, views: 10_001 },
		{ title: 'Plain', published: true, views: 500 },
	])

	const posts = await readDiscoverablePosts()

	// Both `between` bounds are included.
	expect(titles(posts)).toStrictEqual(['Featured story', 'TypeScript tips'])
	expect(await readVisiblePosts(10_000)).toHaveLength(2)
})

it('reads the equality shorthand like its explicit form', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await createPosts([
		{ title: 'Draft', author: ada.id },
		{ title: 'Published', author: ada.id, published: true },
		{ title: 'Other author' },
	])

	const drafts = await readDrafts(ada.id)
	const explicit = await Post.findMany({
		where: {
			author: { eq: ada.id },
			published: { eq: false },
			summary: { isNull: true },
		},
	})

	expect(titles(drafts)).toStrictEqual(['Draft'])
	expect(drafts).toStrictEqual(explicit)
	// A Pointer of the declared target is also an equality operand.
	expect(await Post.count({ where: { author: Author.pointer(ada.id) } })).toBe(
		2,
	)
})

it('rejects a malformed UUID operand before the database', async () => {
	await testApplication(ultimabase)

	// The read rejects while it builds its query, before any database work.
	await expect(Post.findMany({ where: { id: 'post-1' } })).rejects.toThrow(
		new TypeError('where.id must be a valid UUID'),
	)
	await expect(
		Post.findMany({ where: { id: { eq: 'post-1' } } }),
	).rejects.toThrow(new TypeError('where.id.eq must be a valid UUID'))
})

it('filters scalar, text and list fields', async () => {
	await testApplication(ultimabase)
	await createPosts([
		{ title: 'Ultima intro', views: 100, tags: ['backend', 'typescript'] },
		{ title: 'ultimate guide', views: 999, tags: ['typescript'] },
		{ title: 'Other', views: 1000, tags: [] },
		{ title: 'Untagged', views: 5 },
	])

	//#region operators
	const ranged = await Post.findMany({
		where: { views: { gte: 100, lt: 1_000 } },
	})
	const outside = await Post.findMany({
		where: { views: { notBetween: { lower: 100, upper: 999 } } },
	})
	const matching = await Post.findMany({
		where: {
			title: { matches: { source: '^ultima', flags: ['case-insensitive'] } },
		},
	})
	const tagged = await Post.findMany({
		where: { tags: { hasEvery: ['backend', 'typescript'] } },
	})
	const emptyTags = await Post.findMany({ where: { tags: { isEmpty: true } } })
	const noTags = await Post.findMany({ where: { tags: { isNull: true } } })
	//#endregion operators

	expect(titles(ranged)).toStrictEqual(['Ultima intro', 'ultimate guide'])
	expect(titles(outside)).toStrictEqual(['Other', 'Untagged'])
	expect(titles(matching)).toStrictEqual(['Ultima intro', 'ultimate guide'])
	expect(titles(tagged)).toStrictEqual(['Ultima intro'])
	// `isEmpty` excludes a null list; `isNull` finds it.
	expect(titles(emptyTags)).toStrictEqual(['Other'])
	expect(titles(noTags)).toStrictEqual(['Untagged'])
	await expect(
		Post.findMany({
			where: { title: { matches: { source: '(?<=a)b', flags: [] } } },
		}),
	).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: { field: 'title', operator: 'matches' },
	})
})

it('filters JSON and typed object values', async () => {
	await testApplication(ultimabase)
	await Post.createMany({
		data: [
			{
				slug: 'a',
				title: 'Public',
				metadata: { visibility: 'public', rank: 1 },
			},
			{ slug: 'b', title: 'Private', metadata: { visibility: 'private' } },
		],
	})
	await Author.createOne({
		data: {
			displayName: 'Ada',
			email: 'ada@example.com',
			profile: { contact: { email: 'ada@example.org' } },
		},
	})

	expect(titles(await readPublicPosts())).toStrictEqual(['Public'])
	expect(
		(await readAuthorsByContact('ada@example.org')).map((a) => a.displayName),
	).toStrictEqual(['Ada'])
})

it('filters a pointer by identity and by its target', async () => {
	await testApplication(ultimabase)
	const verified = await createAuthor({ verified: true })
	const unverified = await createAuthor()
	await createPosts([
		{ title: 'Verified', author: verified.id },
		{ title: 'Unverified', author: unverified.id },
		{ title: 'Anonymous' },
	])

	expect(titles(await readPostsOfVerifiedAuthor(verified.id))).toStrictEqual([
		'Verified',
	])
	expect(await readPostsOfVerifiedAuthor(unverified.id)).toStrictEqual([])
	// `isNot` also matches a null pointer; `null` finds only null pointers.
	expect(
		titles(
			await Post.findMany({ where: { author: { isNot: { verified: true } } } }),
		),
	).toStrictEqual(['Anonymous', 'Unverified'])
	expect(
		titles(await Post.findMany({ where: { author: null } })),
	).toStrictEqual(['Anonymous'])
})

it('filters parents through a to-many relation', async () => {
	await testApplication(ultimabase)
	const established = await createAuthor()
	const newcomer = await createAuthor()
	await createAuthor()
	await createPosts([
		{ title: 'One', author: established.id, published: true, views: 80 },
		{ title: 'Two', author: established.id, published: true },
		{ title: 'Three', author: established.id, published: true },
		{ title: 'Hit', author: newcomer.id, published: true, views: 500 },
	])

	const authors = await readEstablishedAuthors()

	expect(authors.map(({ id }) => id)).toStrictEqual([established.id])
	expect(await Author.count({ where: { posts: { isEmpty: true } } })).toBe(1)
	// `every` holds for an empty relation; `isNotEmpty` excludes it.
	expect(
		await Author.count({ where: { posts: { every: { views: { gte: 0 } } } } }),
	).toBe(3)
	expect(
		await Author.count({
			where: { posts: { every: { views: { gte: 0 } }, isNotEmpty: true } },
		}),
	).toBe(2)
})
