import {
	booleanField,
	Pointer,
	Schema,
	stringField,
	UltimaBase,
	type FieldBuilder,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
const relationTrace: string[] = []
const rollbackError = new Error('relation mutation rollback fixture')
let rejectNextRelationUpdate = false
const tagLabelField = stringField({ required: true })
const tagVisibleField = booleanField({ default: true })
const articleTitleField = stringField({ required: true })
const articleFields = (field: FieldBuilder) => ({
	tags: field.relation({
		access: {
			read: () => {
				relationTrace.push('article:tags:read')
				return true
			},
			write: ({ change }) => {
				relationTrace.push(`article:tags:update:${change.action}`)
				return true
			},
		},
		target: 'RelationE2ETag',
	}),
	title: articleTitleField,
})

const Article = Schema.define<
	'RelationE2EArticle',
	ReturnType<typeof articleFields>
>({
	className: 'RelationE2EArticle',
	fields: articleFields,
	hooks: {
		afterOperation: {
			update: ({ operation }) => {
				const changesRelation = operation.update.operations.some(
					(candidate) => candidate.kind === 'relation',
				)

				if (changesRelation && rejectNextRelationUpdate) {
					rejectNextRelationUpdate = false
					throw rollbackError
				}
			},
		},
	},
})

const tagFields = (field: FieldBuilder) => ({
	articles: field.relation({
		mappedBy: 'tags',
		target: 'RelationE2EArticle',
	}),
	label: tagLabelField,
	visible: tagVisibleField,
})

const Tag = Schema.define<'RelationE2ETag', ReturnType<typeof tagFields>>({
	className: 'RelationE2ETag',
	fields: tagFields,
	access: {
		read: { where: ({ where }) => where.eq('visible', true) },
	},
})

const authorNameField = stringField({ required: true })
const authorVisibleField = booleanField({ default: true })
const postTitleField = stringField({ required: true })

const authorFields = (field: FieldBuilder) => ({
	name: authorNameField,
	posts: field.relation({ mappedBy: 'author', target: 'RelationE2EPost' }),
	visible: authorVisibleField,
})

const Author = Schema.define<
	'RelationE2EAuthor',
	ReturnType<typeof authorFields>
>({
	className: 'RelationE2EAuthor',
	fields: authorFields,
	access: {
		read: { where: ({ where }) => where.eq('visible', true) },
	},
})

const Post = Schema.define({
	className: 'RelationE2EPost',
	fields: (field) => ({
		author: field.pointer({
			onDelete: 'setNull',
			target: 'RelationE2EAuthor',
		}),
		title: postTitleField,
	}),
})

const privateArticleFields = (field: FieldBuilder) => ({
	tags: field.relation({
		access: { read: false, write: true },
		target: 'RelationE2ETag',
	}),
	title: field.string({ required: true }),
})

const PrivateArticle = Schema.define({
	className: 'RelationE2EPrivateArticle',
	fields: privateArticleFields,
	access: {
		read: { where: { tags: { some: { visible: { eq: true } } } } },
	},
})

const PrivatePointerPost = Schema.define({
	className: 'RelationE2EPrivatePointerPost',
	fields: (field) => ({
		author: field.pointer({
			access: {
				read: { orderBy: true, output: true, where: false },
			},
			target: 'RelationE2EAuthor',
		}),
		title: field.string({ required: true }),
	}),
})

const relationSchemas = [
	Article,
	Tag,
	Author,
	Post,
	PrivateArticle,
	PrivatePointerPost,
] as const

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof relationSchemas],
			readonly [ReturnType<typeof postgresPlugin>]
	  >
	| undefined

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Relation PostgreSQL application has not started')
	}
	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		plugins: [
			hooksPlugin(),
			accessPlugin({ default: true }),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
		schemas: relationSchemas,
		validation: {
			clock: () => new Date('2026-08-04T01:00:00.000Z'),
			timezone: 'UTC',
		},
	})
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('relation vertical with PostgreSQL', { concurrent: false }, () => {
	it('filters owning, inverse, pointer, empty, and nested relations with target Access', async () => {
		const app = getUltimaBase()
		const [alpha, beta, gamma, hidden] = await Tag.createMany(
			{
				data: [
					{ label: 'predicate-alpha' },
					{ label: 'predicate-beta' },
					{ label: 'predicate-gamma' },
					{ label: 'predicate-hidden' },
				],
			},
			{ ultimabase: app },
		)

		if (
			alpha === undefined ||
			beta === undefined ||
			gamma === undefined ||
			hidden === undefined
		) {
			throw new TypeError('Relation predicate tags are incomplete')
		}

		const [mixed, gammaOnly, empty] = await Article.createMany(
			{
				data: [
					{ title: 'Predicate mixed' },
					{ title: 'Predicate gamma' },
					{ title: 'Predicate empty' },
				],
			},
			{ ultimabase: app },
		)

		if (mixed === undefined || gammaOnly === undefined || empty === undefined) {
			throw new TypeError('Relation predicate articles are incomplete')
		}
		await mixed
			.relation('tags')
			.connect([alpha.id, beta.id, hidden.id], { ultimabase: app })
		await gammaOnly.relation('tags').connect(gamma.id, { ultimabase: app })
		await Tag.updateOne(
			{
				where: { id: { eq: hidden.id } },
				data: { visible: false },
			},
			{ ultimabase: app },
		)

		expect(
			await Article.findMany(
				{ where: { tags: { some: { label: { eq: 'predicate-alpha' } } } } },
				{ ultimabase: app },
			),
		).toMatchObject([{ id: mixed.id }])
		expect(
			await Article.count(
				{ where: { tags: { some: { label: { eq: 'predicate-hidden' } } } } },
				{ ultimabase: app },
			),
		).toBe(0)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: { count: { eq: 2 } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: { count: { gte: 3 } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(false)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: {
							count: {
								where: { label: { startsWith: 'predicate-' } },
								gte: 2,
								lte: 2,
							},
						},
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: {
							count: {
								where: {
									articles: {
										some: { title: { eq: 'Predicate mixed' } },
									},
								},
								eq: 2,
							},
						},
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: gammaOnly.id },
						tags: { count: { between: { lower: 1, upper: 1 } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.count(
				{ where: { tags: { none: { label: { eq: 'predicate-gamma' } } } } },
				{ ultimabase: app },
			),
		).toBeGreaterThanOrEqual(2)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: { every: { label: { ne: 'predicate-gamma' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{ where: { id: { eq: empty.id }, tags: { some: {} } } },
				{ ultimabase: app },
			),
		).toBe(false)
		expect(
			await Article.exists(
				{ where: { id: { eq: empty.id }, tags: { none: {} } } },
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{ where: { id: { eq: empty.id }, tags: { every: {} } } },
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{ where: { id: { eq: empty.id }, tags: { isEmpty: true } } },
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{ where: { id: { eq: mixed.id }, tags: { isNotEmpty: true } } },
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Tag.exists(
				{
					where: {
						id: { eq: alpha.id },
						articles: { some: { title: { eq: 'Predicate mixed' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Tag.exists(
				{
					where: {
						id: { eq: alpha.id },
						articles: { count: { eq: 1 } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Article.exists(
				{
					where: {
						id: { eq: mixed.id },
						tags: {
							some: {
								articles: { some: { title: { eq: 'Predicate mixed' } } },
							},
						},
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		const author = await Author.createOne(
			{ data: { name: 'Predicate author' } },
			{ ultimabase: app },
		)
		const post = await Post.createOne(
			{
				data: {
					author: { connect: author.id },
					title: 'Predicate post',
				},
			},
			{ ultimabase: app },
		)
		const hiddenPost = await Post.createOne(
			{
				data: {
					author: {
						create: { name: 'Hidden predicate author', visible: false },
					},
					title: 'Hidden predicate post',
				},
			},
			{ ultimabase: app },
		)
		expect(hiddenPost.author).toBeInstanceOf(Pointer)
		const hiddenAuthorId = (hiddenPost.author as Pointer).id
		const unassignedPost = await Post.createOne(
			{ data: { title: 'Unassigned predicate post' } },
			{ ultimabase: app },
		)

		expect(
			await Post.exists(
				{ where: { id: { eq: post.id }, author: { eq: author.id } } },
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: post.id },
						author: { is: { name: { eq: 'Predicate author' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: post.id },
						author: { isNot: { name: { eq: 'Predicate author' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(false)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: hiddenPost.id },
						author: { eq: hiddenAuthorId },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: hiddenPost.id },
						author: { is: { name: { eq: 'Hidden predicate author' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(false)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: hiddenPost.id },
						author: {
							isNot: { name: { eq: 'Hidden predicate author' } },
						},
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: unassignedPost.id },
						author: { isNot: { name: { eq: 'Predicate author' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Post.exists(
				{
					where: {
						id: { eq: unassignedPost.id },
						author: {
							isNot: { name: { eq: 'Predicate author' } },
							isNotNull: true,
						},
					},
				},
				{ ultimabase: app },
			),
		).toBe(false)

		expect(
			await Author.exists(
				{
					where: {
						id: { eq: author.id },
						posts: { some: { title: { eq: 'Predicate post' } } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
		expect(
			await Author.exists(
				{
					where: {
						id: { eq: author.id },
						posts: { count: { eq: 1 } },
					},
				},
				{ ultimabase: app },
			),
		).toBe(true)
	})

	it('executes owning and inverse traversal with normal Query semantics', async () => {
		const app = getUltimaBase()
		const [alpha, beta, gamma] = await Tag.createMany(
			{ data: [{ label: 'alpha' }, { label: 'beta' }, { label: 'gamma' }] },
			{ ultimabase: app },
		)
		const article = await Article.createOne(
			{ data: { title: 'Relations' } },
			{ ultimabase: app },
		)

		if (alpha === undefined || beta === undefined || gamma === undefined) {
			throw new TypeError('Relation fixture tags are incomplete')
		}

		const tags = article.relation('tags')

		await tags.connect([alpha.id, beta.id], {
			ultimabase: app,
		})
		await tags.connect(alpha.id, { ultimabase: app })

		expect(await tags.count(undefined, { ultimabase: app })).toBe(2)
		expect(await tags.exists(undefined, { ultimabase: app })).toBe(true)
		expect(
			(
				await tags.findMany(
					{
						where: { label: { eq: 'alpha' } },
						orderBy: { label: 'asc' },
						limit: 1,
						select: { label: true },
					},
					{ ultimabase: app },
				)
			).map((tag) => tag.toJSON()),
		).toStrictEqual([{ id: alpha.id, label: 'alpha' }])
		expect(
			await alpha.relation('articles').count(undefined, { ultimabase: app }),
		).toBe(1)
		expect(relationTrace).toEqual(expect.arrayContaining(['article:tags:read']))

		await tags.set([beta.id, gamma.id], {
			ultimabase: app,
		})
		expect(
			await alpha.relation('articles').count(undefined, { ultimabase: app }),
		).toBe(0)
		await tags.disconnect(beta.id, { ultimabase: app })
		expect(
			(await tags.findMany(undefined, { ultimabase: app })).map(
				({ label }) => label,
			),
		).toStrictEqual(['gamma'])

		rejectNextRelationUpdate = true
		await expect(tags.connect(alpha.id, { ultimabase: app })).rejects.toBe(
			rollbackError,
		)
		expect(await tags.count(undefined, { ultimabase: app })).toBe(1)

		await tags.clear({ ultimabase: app })
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		const inverseTag = await Tag.createOne(
			{ data: { label: 'inverse' } },
			{ ultimabase: app },
		)
		const inverseArticles = inverseTag.relation('articles')

		await inverseArticles.connect(article.id, {
			ultimabase: app,
		})
		expect(await tags.count(undefined, { ultimabase: app })).toBe(1)
		await inverseArticles.disconnect(article.id, {
			ultimabase: app,
		})
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		await tags.connect(gamma.id, { ultimabase: app })
		await gamma.delete({}, { ultimabase: app })
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		const cleanupTag = await Tag.createOne(
			{ data: { label: 'cleanup' } },
			{ ultimabase: app },
		)
		await tags.connect(cleanupTag.id, {
			ultimabase: app,
		})
		await article.delete({}, { ultimabase: app })
		expect(
			await cleanupTag
				.relation('articles')
				.count(undefined, { ultimabase: app }),
		).toBe(0)
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
		const app = getUltimaBase()
		const [alpha, zeta, hidden] = await Tag.createMany(
			{
				data: [
					{ label: 'include-alpha' },
					{ label: 'include-zeta' },
					{ label: 'include-hidden' },
				],
			},
			{ ultimabase: app },
		)
		const article = await Article.createOne(
			{ data: { title: 'Included relations' } },
			{ ultimabase: app },
		)

		if (alpha === undefined || zeta === undefined || hidden === undefined) {
			throw new TypeError('Included relation tags are incomplete')
		}

		await article
			.relation('tags')
			.connect([alpha.id, zeta.id, hidden.id], { ultimabase: app })
		await Tag.updateOne(
			{
				where: { id: { eq: hidden.id } },
				data: { visible: false },
			},
			{ ultimabase: app },
		)
		relationTrace.length = 0
		const articles = await Article.findMany(
			{
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
			},
			{ ultimabase: app },
		)

		expect(articles).toHaveLength(1)
		const includedTags = articles[0]?.tags
		if (!Array.isArray(includedTags) || !(includedTags[0] instanceof Tag)) {
			throw new TypeError('Expected one included tag model')
		}
		const nestedArticles = includedTags[0].articles
		if (
			!Array.isArray(nestedArticles) ||
			!(nestedArticles[0] instanceof Article)
		) {
			throw new TypeError('Expected one nested included article model')
		}
		expect(includedTags).toHaveLength(1)
		expect(includedTags[0].label).toBe('include-zeta')
		expect(nestedArticles).toHaveLength(1)
		expect(nestedArticles[0].title).toBe('Included relations')
		expect(relationTrace).toStrictEqual(['article:tags:read'])

		const author = await Author.createOne(
			{ data: { name: 'Included author' } },
			{ ultimabase: app },
		)
		const otherAuthor = await Author.createOne(
			{ data: { name: 'Other included author' } },
			{ ultimabase: app },
		)
		await Post.createMany(
			{
				data: [
					{
						author: Author.pointer(author.id),
						title: 'Included first',
					},
					{
						author: Author.pointer(author.id),
						title: 'Included second',
					},
					{
						author: Author.pointer(otherAuthor.id),
						title: 'Other first',
					},
					{
						author: Author.pointer(otherAuthor.id),
						title: 'Other second',
					},
				],
			},
			{ ultimabase: app },
		)
		const authors = await Author.findMany(
			{
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
			},
			{ ultimabase: app },
		)

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
		const app = getUltimaBase()
		const author = await Author.createOne(
			{ data: { name: 'Ada' } },
			{ ultimabase: app },
		)
		const post = await Post.createOne(
			{
				data: {
					author: { connect: author.id },
					title: 'Pointers',
				},
			},
			{ ultimabase: app },
		)
		const posts = author.relation('posts')

		expect(await posts.count(undefined, { ultimabase: app })).toBe(1)
		const included = await posts.findMany(
			{ include: { author: { select: { name: true } } } },
			{ ultimabase: app },
		)

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
		await posts.disconnect(post.id, {
			ultimabase: app,
		})
		expect(await posts.count(undefined, { ultimabase: app })).toBe(0)
		await posts.connect(post.id, { ultimabase: app })
		expect(await posts.count(undefined, { ultimabase: app })).toBe(1)
	})

	it('denies relation traversal at the source field before returning targets', async () => {
		const app = getUltimaBase()
		const tag = await Tag.createOne(
			{ data: { label: 'private' } },
			{ ultimabase: app },
		)
		const article = await PrivateArticle.createOne(
			{ data: { title: 'Private relation' } },
			{ ultimabase: app },
		)

		await article.relation('tags').connect(tag.id, { ultimabase: app })
		expect(
			await PrivateArticle.findMany(
				{ select: { id: true, title: true } },
				{ ultimabase: app },
			),
		).toMatchObject([{ id: article.id, title: 'Private relation' }])
		await expect(
			article.relation('tags').findMany(undefined, { ultimabase: app }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivateArticle.findMany(
				{ where: { tags: { some: { label: { eq: 'private' } } } } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivateArticle.findMany(
				{ where: { tags: { count: { gt: 0 } } } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('enforces pointer filter Access before identity or target traversal', async () => {
		const app = getUltimaBase()
		const author = await Author.createOne(
			{ data: { name: 'Private pointer author' } },
			{ ultimabase: app },
		)
		await PrivatePointerPost.createOne(
			{
				data: {
					author: { connect: author.id },
					title: 'Private pointer source',
				},
			},
			{ ultimabase: app },
		)

		await expect(
			PrivatePointerPost.findMany(
				{ where: { author: { eq: author.id } } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			PrivatePointerPost.findMany(
				{ where: { author: { is: { name: { eq: author.name } } } } },
				{ ultimabase: app },
			),
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
		const verifier = new UltimaBase({
			plugins: [
				hooksPlugin(),
				accessPlugin({ default: true }),
				postgresPlugin({
					schemaPolicy: 'fail',
					url: activeFixture.connectionUri,
				}),
			],
			schemas: relationSchemas,
		})

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
