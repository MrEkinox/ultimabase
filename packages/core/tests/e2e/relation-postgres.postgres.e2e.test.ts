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

		const tags = article.relation('tags')

		await tags.connect([alpha.id, beta.id])
		await tags.connect(alpha.id)

		expect(await tags.count(undefined)).toBe(2)
		expect(await tags.exists(undefined)).toBe(true)
		expect(
			(
				await tags.findMany({
					where: { label: { eq: 'alpha' } },
					orderBy: { label: 'asc' },
					limit: 1,
					select: { label: true },
				})
			).map((tag) => tag.toJSON()),
		).toStrictEqual([{ id: alpha.id, label: 'alpha' }])
		expect(await alpha.relation('articles').count(undefined)).toBe(1)
		expect(relationTrace).toEqual(expect.arrayContaining(['article:tags:read']))

		await tags.set([beta.id, gamma.id])
		expect(await alpha.relation('articles').count(undefined)).toBe(0)
		await tags.disconnect(beta.id)
		expect(
			(await tags.findMany(undefined)).map(({ label }) => label),
		).toStrictEqual(['gamma'])

		rejectNextRelationMutation()
		await expect(tags.connect(alpha.id)).rejects.toBe(rollbackError)
		expect(await tags.count(undefined)).toBe(1)

		await tags.clear()
		expect(await tags.count(undefined)).toBe(0)

		const inverseTag = await Tag.createOne({ data: { label: 'inverse' } })
		const inverseArticles = inverseTag.relation('articles')

		await inverseArticles.connect(article.id)
		expect(await tags.count(undefined)).toBe(1)
		await inverseArticles.disconnect(article.id)
		expect(await tags.count(undefined)).toBe(0)

		await tags.connect(gamma.id)
		await gamma.delete({})
		expect(await tags.count(undefined)).toBe(0)

		const cleanupTag = await Tag.createOne({ data: { label: 'cleanup' } })
		await tags.connect(cleanupTag.id)
		await article.delete({})
		expect(await cleanupTag.relation('articles').count(undefined)).toBe(0)
		expect(relationTrace).toEqual(
			expect.arrayContaining([
				'article:tags:update:clear',
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

		await article.relation('tags').connect([alpha.id, zeta.id, hidden.id])
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
					limit: 1,
					select: { label: true },
					include: {
						articles: {
							where: { id: { eq: article.id } },
							limit: 1,
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
		if (!Array.isArray(includedTags) || !(includedTags[0] instanceof Tag)) {
			throw new TypeError('Expected one included tag model')
		}
		const nestedArticles: unknown = Reflect.get(includedTags[0], 'articles')
		if (
			!Array.isArray(nestedArticles) ||
			!(nestedArticles[0] instanceof Article)
		) {
			throw new TypeError('Expected one nested included article model')
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
					limit: 1,
					offset: 1,
					select: { title: true },
				},
			},
		})

		expect(authors).toHaveLength(2)
		const firstPosts = authors[0]?.posts
		const secondPosts = authors[1]?.posts
		if (
			!Array.isArray(firstPosts) ||
			!(firstPosts[0] instanceof Post) ||
			!Array.isArray(secondPosts) ||
			!(secondPosts[0] instanceof Post)
		) {
			throw new TypeError('Expected one included post model per author')
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
		const posts = author.relation('posts')

		expect(await posts.count(undefined)).toBe(1)
		const included = await posts.findMany({
			include: { author: { select: { name: true } } },
		})

		expect(included).toHaveLength(1)
		expect(included[0]?.title).toBe('Pointers')
		const includedAuthor = included[0]?.author
		if (!(includedAuthor instanceof Author)) {
			throw new TypeError('Expected the relation post author to be included')
		}
		expect(includedAuthor.toJSON()).toStrictEqual({
			id: author.id,
			name: 'Ada',
		})
		await posts.disconnect(post.id)
		expect(await posts.count(undefined)).toBe(0)
		await posts.connect(post.id)
		expect(await posts.count(undefined)).toBe(1)
	})

	it('denies relation traversal at the source field before returning targets', async () => {
		const tag = await Tag.createOne({ data: { label: 'private' } })
		// Without a visible tag the article is not readable yet (ADR-0306).
		const article = await PrivateArticle.createOne({
			data: { title: 'Private relation' },
			select: { id: true },
		})

		await article.relation('tags').connect(tag.id)
		expect(
			await PrivateArticle.findMany({ select: { id: true, title: true } }),
		).toMatchObject([{ id: article.id, title: 'Private relation' }])
		await expect(
			article.relation('tags').findMany(undefined),
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
