import {
	booleanField,
	pointerField,
	relationField,
	Schema,
	stringField,
	UltimaBase,
	type PointerField,
	type RelationField,
	type ScalarFieldInferenceState,
	type SchemaClass,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const relationTrace: string[] = []
const rollbackError = new Error('relation mutation rollback fixture')
let rejectNextRelationUpdate = false
const tagLabelField = stringField({ validation: { required: true } })
const tagVisibleField = booleanField({ default: true })
const articleTitleField = stringField({ validation: { required: true } })

type ArticleSchema = SchemaClass<
	'RelationE2EArticle',
	Readonly<{
		readonly title: typeof articleTitleField
		readonly tags: RelationField<TagSchema, undefined>
	}>,
	readonly []
>

type TagSchema = SchemaClass<
	'RelationE2ETag',
	Readonly<{
		readonly label: typeof tagLabelField
		readonly articles: RelationField<ArticleSchema, 'tags'>
		readonly visible: typeof tagVisibleField
	}>,
	readonly []
>

function resolveTag(): TagSchema {
	return Tag
}

const Article: ArticleSchema = Schema.define({
	className: 'RelationE2EArticle',
	fields: {
		tags: relationField({
			access: {
				read: ({ kind }) => {
					relationTrace.push(`article:tags:read:${kind}`)

					return true
				},
				update: ({ value }) => {
					relationTrace.push(`article:tags:update:${value.action}`)

					return true
				},
			},
			target: resolveTag,
		}),
		title: articleTitleField,
	},
	hooks: {
		afterUpdate: ({ operation, result }) => {
			const changesRelation = operation.update.operations.some(
				(candidate) => candidate.kind === 'relation',
			)

			if (changesRelation && rejectNextRelationUpdate) {
				rejectNextRelationUpdate = false
				throw rollbackError
			}

			return result
		},
	},
})

const Tag: TagSchema = Schema.define({
	className: 'RelationE2ETag',
	access: {
		filter: {
			read: ({ filter }) => filter.equalTo('visible', true),
		},
	},
	fields: {
		articles: relationField({
			mappedBy: 'tags',
			target: (): ArticleSchema => Article,
		}),
		label: tagLabelField,
		visible: tagVisibleField,
	},
	hooks: {
		afterRead: ({ result }) => {
			relationTrace.push('tag:afterRead')

			return result
		},
		beforeRead: ({ query }) => {
			relationTrace.push('tag:beforeRead')

			return query
		},
	},
})

type OptionalPointerState = ScalarFieldInferenceState<
	false,
	false,
	false,
	false
>

const authorNameField = stringField({ validation: { required: true } })
const postTitleField = stringField({ validation: { required: true } })

type AuthorSchema = SchemaClass<
	'RelationE2EAuthor',
	Readonly<{
		readonly name: typeof authorNameField
		readonly posts: RelationField<PostSchema, 'author'>
	}>,
	readonly []
>

type PostSchema = SchemaClass<
	'RelationE2EPost',
	Readonly<{
		readonly author: PointerField<AuthorSchema, OptionalPointerState>
		readonly title: typeof postTitleField
	}>,
	readonly []
>

function resolvePost(): PostSchema {
	return Post
}

const Author: AuthorSchema = Schema.define({
	className: 'RelationE2EAuthor',
	fields: {
		name: authorNameField,
		posts: relationField({ mappedBy: 'author', target: resolvePost }),
	},
})

const Post: PostSchema = Schema.define({
	className: 'RelationE2EPost',
	fields: {
		author: pointerField({
			onDelete: 'setNull',
			target: (): AuthorSchema => Author,
		}),
		title: postTitleField,
	},
})

const PrivateArticle = Schema.define({
	className: 'RelationE2EPrivateArticle',
	fields: {
		tags: relationField({
			access: { read: false, update: true },
			target: () => Tag,
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const relationSchemas = [Article, Tag, Author, Post, PrivateArticle] as const

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
			.connect(
				[Tag.pointer(alpha.id), Tag.pointer(beta.id), Tag.pointer(hidden.id)],
				{ ultimabase: app },
			)
		await gammaOnly
			.relation('tags')
			.connect(Tag.pointer(gamma.id), { ultimabase: app })
		await Tag.updateOne(
			{
				where: (where) => where.eq('id', hidden.id),
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
		await Post.createOne(
			{ data: { author: Author.pointer(author.id), title: 'Predicate post' } },
			{ ultimabase: app },
		)

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

		await tags.connect([Tag.pointer(alpha.id), Tag.pointer(beta.id)], {
			ultimabase: app,
		})
		await tags.connect(Tag.pointer(alpha.id), { ultimabase: app })

		expect(await tags.count(undefined, { ultimabase: app })).toBe(2)
		expect(await tags.exists(undefined, { ultimabase: app })).toBe(true)
		expect(
			(
				await tags.findMany(
					{
						where: { label: { eq: 'alpha' } },
						orderBy: [{ label: 'asc' }],
						limit: 1,
						cursor: true,
						select: { label: true },
					},
					{ ultimabase: app },
				)
			).map((tag) => tag.toJSON()),
		).toStrictEqual([{ label: 'alpha' }])
		expect(
			await alpha.relation('articles').count(undefined, { ultimabase: app }),
		).toBe(1)
		expect(relationTrace).toEqual(
			expect.arrayContaining([
				'article:tags:read:count',
				'tag:beforeRead',
				'tag:afterRead',
			]),
		)

		await tags.set([Tag.pointer(beta.id), Tag.pointer(gamma.id)], {
			ultimabase: app,
		})
		expect(
			await alpha.relation('articles').count(undefined, { ultimabase: app }),
		).toBe(0)
		await tags.disconnect(Tag.pointer(beta.id), { ultimabase: app })
		expect(
			(await tags.findMany(undefined, { ultimabase: app })).map(
				({ label }) => label,
			),
		).toStrictEqual(['gamma'])

		rejectNextRelationUpdate = true
		await expect(
			tags.connect(Tag.pointer(alpha.id), { ultimabase: app }),
		).rejects.toBe(rollbackError)
		expect(await tags.count(undefined, { ultimabase: app })).toBe(1)

		await tags.clear({ ultimabase: app })
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		const inverseTag = await Tag.createOne(
			{ data: { label: 'inverse' } },
			{ ultimabase: app },
		)
		const inverseArticles = inverseTag.relation('articles')

		await inverseArticles.connect(Article.pointer(article.id), {
			ultimabase: app,
		})
		expect(await tags.count(undefined, { ultimabase: app })).toBe(1)
		await inverseArticles.disconnect(Article.pointer(article.id), {
			ultimabase: app,
		})
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		await tags.connect(Tag.pointer(gamma.id), { ultimabase: app })
		await gamma.delete({}, { ultimabase: app })
		expect(await tags.count(undefined, { ultimabase: app })).toBe(0)

		const cleanupTag = await Tag.createOne(
			{ data: { label: 'cleanup' } },
			{ ultimabase: app },
		)
		await tags.connect(Tag.pointer(cleanupTag.id), { ultimabase: app })
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
			.connect(
				[Tag.pointer(alpha.id), Tag.pointer(zeta.id), Tag.pointer(hidden.id)],
				{ ultimabase: app },
			)
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
						orderBy: [{ label: 'desc' }],
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
		expect(articles[0]?.tags).toHaveLength(1)
		expect(articles[0]?.tags[0]?.label).toBe('include-zeta')
		expect(articles[0]?.tags[0]?.articles).toHaveLength(1)
		expect(articles[0]?.tags[0]?.articles[0]?.title).toBe('Included relations')
		expect(relationTrace).toStrictEqual(['article:tags:read:find-many'])

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
					{ author: Author.pointer(author.id), title: 'Included first' },
					{ author: Author.pointer(author.id), title: 'Included second' },
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
				orderBy: [{ name: 'asc' }],
				select: { name: true },
				include: {
					posts: {
						orderBy: [{ title: 'desc' }],
						limit: 1,
						offset: 1,
						select: { title: true },
					},
				},
			},
			{ ultimabase: app },
		)

		expect(authors).toHaveLength(2)
		expect(authors[0]?.posts[0]?.title).toBe('Included first')
		expect(authors[1]?.posts[0]?.title).toBe('Other first')
	})

	it('reuses pointer storage for inverse relation reads and mutations', async () => {
		const app = getUltimaBase()
		const author = await Author.createOne(
			{ data: { name: 'Ada' } },
			{ ultimabase: app },
		)
		const post = await Post.createOne(
			{ data: { author: Author.pointer(author.id), title: 'Pointers' } },
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
		expect(included[0]?.author?.toJSON()).toStrictEqual({ name: 'Ada' })
		await posts.disconnect(Post.pointer(post.id), { ultimabase: app })
		expect(await posts.count(undefined, { ultimabase: app })).toBe(0)
		await posts.connect(Post.pointer(post.id), { ultimabase: app })
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

		await article
			.relation('tags')
			.connect(Tag.pointer(tag.id), { ultimabase: app })
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

	it('recognizes managed joins without claiming unrelated tables', async () => {
		const activeFixture = fixture

		if (activeFixture === undefined) {
			throw new TypeError('Relation PostgreSQL fixture is unavailable')
		}

		await activeFixture.pool.query(
			'CREATE TABLE relation_external_notes (note text NOT NULL)',
		)

		const verifier = new UltimaBase({
			plugins: [
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
