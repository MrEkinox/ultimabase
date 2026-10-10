import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { describe, expect, it } from 'vitest'

import {
	relationTrace,
	rollbackError,
	rejectNextRelationMutation,
	Article,
	Tag,
	Author,
	Post,
	PrivateArticle,
	PrivatePointerPost,
	relationSchemas,
	fixture,
	getUltimaBase,
} from './relation-postgres-fixture.js'
import { registerRelationFilterTests } from './register-relation-filter-tests.js'

// Included rows are frozen plain objects (ADR-0310).
const isPlainRow = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' &&
	value !== null &&
	Object.getPrototypeOf(value) === Object.prototype &&
	Object.isFrozen(value)

type TagLinks = NonNullable<
	Parameters<typeof Article.updateOne>[0]['data']['tags']
>
type PostLinks = NonNullable<
	Parameters<typeof Author.updateOne>[0]['data']['posts']
>

describe('relation vertical with PostgreSQL', { concurrent: false }, () => {
	registerRelationFilterTests()

	it('executes owning and inverse traversal with normal Query semantics', async () => {
		const [alpha, beta, gamma] = await Tag.createMany({
			data: [{ label: 'alpha' }, { label: 'beta' }, { label: 'gamma' }],
		})
		const article = await Article.createOne({ data: { title: 'Relations' } })

		if (alpha === undefined || beta === undefined || gamma === undefined) {
			throw new TypeError('Relation fixture tags are incomplete')
		}

		// ADR-0310: relation handles are gone; links go through nested writes
		// (ADR-0308) and reads through include or a relation filter.
		const updateTags = (tags: TagLinks) =>
			Article.updateOne({
				where: { id: { eq: article.id } },
				data: { tags },
				select: { id: true },
			})
		const tagLabels = async () =>
			(
				await Article.findOneOrThrow({
					where: { id: { eq: article.id } },
					select: { id: true },
					include: {
						tags: { orderBy: { label: 'asc' }, select: { label: true } },
					},
				})
			).tags.map(({ label }) => label)
		const articleCount = (tagId: string) =>
			Article.count({ where: { tags: { some: { id: { eq: tagId } } } } })

		await updateTags({ connect: [alpha.id, beta.id] })
		await updateTags({ connect: [alpha.id] })

		expect(await tagLabels()).toStrictEqual(['alpha', 'beta'])
		await expect(
			Article.exists({
				where: { id: { eq: article.id }, tags: { some: {} } },
			}),
		).resolves.toBe(true)
		const filtered = await Tag.findMany({
			where: {
				articles: { some: { id: { eq: article.id } } },
				label: { eq: 'alpha' },
			},
			orderBy: { label: 'asc' },
			take: 1,
			select: { label: true },
		})
		expect(filtered).toStrictEqual([{ id: alpha.id, label: 'alpha' }])
		expect(await articleCount(alpha.id)).toBe(1)
		expect(relationTrace).toEqual(expect.arrayContaining(['article:tags:read']))

		await updateTags({ set: [beta.id, gamma.id] })
		expect(await articleCount(alpha.id)).toBe(0)
		await updateTags({ disconnect: [beta.id] })
		expect(await tagLabels()).toStrictEqual(['gamma'])

		rejectNextRelationMutation()
		await expect(updateTags({ connect: [alpha.id] })).rejects.toBe(
			rollbackError,
		)
		expect(await tagLabels()).toStrictEqual(['gamma'])

		await updateTags({ set: [] })
		expect(await tagLabels()).toStrictEqual([])

		const inverseTag = await Tag.createOne({ data: { label: 'inverse' } })
		await updateTags({ connect: [inverseTag.id] })
		expect(await articleCount(inverseTag.id)).toBe(1)
		await updateTags({ disconnect: [inverseTag.id] })
		expect(await tagLabels()).toStrictEqual([])

		await updateTags({ connect: [gamma.id] })
		await Tag.deleteOne({ where: { id: { eq: gamma.id } } })
		expect(await tagLabels()).toStrictEqual([])

		const cleanupTag = await Tag.createOne({ data: { label: 'cleanup' } })
		await updateTags({ connect: [cleanupTag.id] })
		await Article.deleteOne({ where: { id: { eq: article.id } } })
		expect(await articleCount(cleanupTag.id)).toBe(0)
		expect(relationTrace).toEqual(
			expect.arrayContaining([
				'article:tags:update:connect',
				'article:tags:update:disconnect',
				'article:tags:update:set',
			]),
		)
	})

	it('includes owning, inverse, and nested relation collections in one relational read', async () => {
		const [alpha, zeta, hidden] = await Tag.createMany({
			data: [
				{ label: 'include-alpha' },
				{ label: 'include-zeta' },
				{ label: 'include-hidden' },
			],
		})
		const article = await Article.createOne({
			data: { title: 'Included relations' },
		})

		if (alpha === undefined || zeta === undefined || hidden === undefined) {
			throw new TypeError('Included relation tags are incomplete')
		}

		await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { tags: { connect: [alpha.id, zeta.id, hidden.id] } },
		})
		// The hidden result is requested as `select: { id: true }` (ADR-0306).
		await Tag.updateOne({
			where: { id: { eq: hidden.id } },
			data: { visible: false },
			select: { id: true },
		})
		relationTrace.length = 0
		// Nested circular inclusions are Runtime coverage here; the retained
		// Typegen graph owns their exact cross-schema editor contract.
		const findArticlesWithProjection = Article.findMany.bind(
			Article,
		) as unknown as (input: unknown) => Promise<readonly unknown[]>
		const articles = await findArticlesWithProjection({
			where: { id: { eq: article.id } },
			select: { title: true },
			include: {
				tags: {
					where: {
						label: {
							in: ['include-alpha', 'include-zeta', 'include-hidden'],
						},
					},
					orderBy: { label: 'desc' },
					take: 1,
					select: { label: true },
					include: {
						articles: {
							where: { id: { eq: article.id } },
							take: 1,
							select: { title: true },
						},
					},
				},
			},
		})

		expect(articles).toHaveLength(1)
		const firstArticle = articles[0]
		const includedTags: unknown =
			typeof firstArticle === 'object' && firstArticle !== null
				? Reflect.get(firstArticle, 'tags')
				: undefined
		if (!Array.isArray(includedTags) || !isPlainRow(includedTags[0])) {
			throw new TypeError('Expected one included tag row')
		}
		const nestedArticles: unknown = Reflect.get(includedTags[0], 'articles')
		if (!Array.isArray(nestedArticles) || !isPlainRow(nestedArticles[0])) {
			throw new TypeError('Expected one nested included article row')
		}
		expect(includedTags).toHaveLength(1)
		expect(Reflect.get(includedTags[0], 'label')).toBe('include-zeta')
		expect(nestedArticles).toHaveLength(1)
		expect(Reflect.get(nestedArticles[0], 'title')).toBe('Included relations')
		expect(relationTrace).toStrictEqual(['article:tags:read'])

		const author = await Author.createOne({ data: { name: 'Included author' } })
		const otherAuthor = await Author.createOne({
			data: { name: 'Other included author' },
		})
		await Post.createMany({
			data: [
				{
					author: { connect: Author.pointer(author.id) },
					title: 'Included first',
				},
				{
					author: { connect: Author.pointer(author.id) },
					title: 'Included second',
				},
				{
					author: { connect: Author.pointer(otherAuthor.id) },
					title: 'Other first',
				},
				{
					author: { connect: Author.pointer(otherAuthor.id) },
					title: 'Other second',
				},
			],
		})
		const authors = await Author.findMany({
			where: { id: { in: [author.id, otherAuthor.id] } },
			orderBy: { name: 'asc' },
			select: { name: true },
			include: {
				posts: {
					orderBy: { title: 'desc' },
					take: 1,
					skip: 1,
					select: { title: true },
				},
			},
		})

		expect(authors).toHaveLength(2)
		const firstPosts = authors[0]?.posts
		const secondPosts = authors[1]?.posts
		if (
			firstPosts?.[0] === undefined ||
			!isPlainRow(firstPosts[0]) ||
			secondPosts?.[0] === undefined ||
			!isPlainRow(secondPosts[0])
		) {
			throw new TypeError('Expected one included post row per author')
		}
		expect(firstPosts[0].title).toBe('Included first')
		expect(secondPosts[0].title).toBe('Other first')
	})

	it('reuses pointer storage for inverse relation reads and mutations', async () => {
		const author = await Author.createOne({ data: { name: 'Ada' } })
		const post = await Post.createOne({
			data: {
				author: { connect: author.id },
				title: 'Pointers',
			},
		})
		const readPosts = async () =>
			(
				await Author.findOneOrThrow({
					where: { id: { eq: author.id } },
					select: { id: true },
					include: { posts: { select: { title: true } } },
				})
			).posts
		const updatePosts = (posts: PostLinks) =>
			Author.updateOne({
				where: { id: { eq: author.id } },
				data: { posts },
				select: { id: true },
			})

		const included = await Post.findMany({
			where: { author: { eq: author.id } },
			include: { author: { select: { name: true } } },
		})

		expect(await readPosts()).toStrictEqual([
			{ id: post.id, title: 'Pointers' },
		])
		expect(included).toHaveLength(1)
		expect(included[0]?.title).toBe('Pointers')
		const includedAuthor = included[0]?.author
		if (!isPlainRow(includedAuthor)) {
			throw new TypeError('Expected the relation post author to be included')
		}
		expect(includedAuthor).toStrictEqual({
			id: author.id,
			name: 'Ada',
		})
		await updatePosts({ disconnect: [post.id] })
		expect(await readPosts()).toHaveLength(0)
		await updatePosts({ connect: [post.id] })
		expect(await readPosts()).toHaveLength(1)
	})

	it('denies relation traversal at the source field before returning targets', async () => {
		const tag = await Tag.createOne({ data: { label: 'private' } })
		// Without a visible tag the article is not readable yet (ADR-0306).
		const article = await PrivateArticle.createOne({
			data: { title: 'Private relation' },
			select: { id: true },
		})

		await PrivateArticle.updateOne(
			{
				where: { id: { eq: article.id } },
				data: { tags: { connect: [tag.id] } },
				select: { id: true },
			},
			{ useMasterKey: true },
		)
		expect(
			await PrivateArticle.findMany({ select: { id: true, title: true } }),
		).toMatchObject([{ id: article.id, title: 'Private relation' }])
		await expect(
			PrivateArticle.findMany({
				where: { id: { eq: article.id } },
				include: { tags: {} },
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivateArticle.findMany({
				where: { tags: { some: { label: { eq: 'private' } } } },
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivateArticle.findMany({ where: { tags: { count: { gt: 0 } } } }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('enforces pointer filter Access before identity or target traversal', async () => {
		const author = await Author.createOne({
			data: { name: 'Private pointer author' },
		})
		await PrivatePointerPost.createOne({
			data: {
				author: { connect: author.id },
				title: 'Private pointer source',
			},
		})

		await expect(
			PrivatePointerPost.findMany({ where: { author: { eq: author.id } } }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivatePointerPost.findMany({
				where: { author: { is: { name: { eq: author.name } } } },
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('recognizes managed joins without claiming unrelated tables', async () => {
		const activeFixture = fixture

		if (activeFixture === undefined) {
			throw new TypeError('Relation PostgreSQL fixture is unavailable')
		}

		await activeFixture.pool.query(
			'CREATE TABLE relation_external_notes (note text NOT NULL)',
		)
		await getUltimaBase().dispose()
		const verifier = new (UltimaBase.use(
			hooksPlugin(),
			accessPlugin({ default: true }),
			postgresPlugin({
				schemaPolicy: 'fail',
				url: activeFixture.connectionUri,
			}),
		))({ schemas: relationSchemas })

		try {
			await expect(verifier.start()).resolves.toBeUndefined()
			await expect(
				activeFixture.pool.query(
					"SELECT to_regclass('relation_external_notes') AS name",
				),
			).resolves.toMatchObject({ rows: [{ name: 'relation_external_notes' }] })
		} finally {
			await verifier.dispose()
		}
	})
})
