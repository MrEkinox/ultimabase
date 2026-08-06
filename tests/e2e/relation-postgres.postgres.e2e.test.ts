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
			[
				{ label: 'predicate-alpha' },
				{ label: 'predicate-beta' },
				{ label: 'predicate-gamma' },
				{ label: 'predicate-hidden' },
			],
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
			[
				{ title: 'Predicate mixed' },
				{ title: 'Predicate gamma' },
				{ title: 'Predicate empty' },
			],
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
			await Article.query()
				.where((where) =>
					where.some('tags', (tag) => tag.eq('label', 'predicate-alpha')),
				)
				.find({ ultimabase: app }),
		).toMatchObject([{ id: mixed.id }])
		expect(
			await Article.query()
				.where((where) =>
					where.some('tags', (tag) => tag.eq('label', 'predicate-hidden')),
				)
				.count({ ultimabase: app }),
		).toBe(0)
		expect(
			await Article.query()
				.where((where) =>
					where.none('tags', (tag) => tag.eq('label', 'predicate-gamma')),
				)
				.count({ ultimabase: app }),
		).toBeGreaterThanOrEqual(2)
		expect(
			await Article.query()
				.where({ id: { eq: mixed.id } })
				.where((where) =>
					where.every('tags', (tag) => tag.ne('label', 'predicate-gamma')),
				)
				.exists({ ultimabase: app }),
		).toBe(true)
		expect(
			await Article.query()
				.where({ id: { eq: empty.id } })
				.where((where) => where.some('tags', (tag) => tag))
				.exists({ ultimabase: app }),
		).toBe(false)
		expect(
			await Article.query()
				.where({ id: { eq: empty.id } })
				.where((where) => where.none('tags', (tag) => tag))
				.exists({ ultimabase: app }),
		).toBe(true)
		expect(
			await Article.query()
				.where({ id: { eq: empty.id } })
				.where((where) => where.every('tags', (tag) => tag))
				.exists({ ultimabase: app }),
		).toBe(true)
		expect(
			await Tag.query()
				.where({ id: { eq: alpha.id } })
				.where((where) =>
					where.some('articles', (article) =>
						article.eq('title', 'Predicate mixed'),
					),
				)
				.exists({ ultimabase: app }),
		).toBe(true)
		expect(
			await Article.query()
				.where({ id: { eq: mixed.id } })
				.where((where) =>
					where.some('tags', (tag) =>
						tag.some('articles', (article) =>
							article.eq('title', 'Predicate mixed'),
						),
					),
				)
				.exists({ ultimabase: app }),
		).toBe(true)

		const author = await Author.create(
			{ data: { name: 'Predicate author' } },
			{ ultimabase: app },
		)
		await Post.create(
			{ data: { author: Author.pointer(author.id), title: 'Predicate post' } },
			{ ultimabase: app },
		)

		expect(
			await Author.query()
				.where({ id: { eq: author.id } })
				.where((where) =>
					where.some('posts', (post) => post.eq('title', 'Predicate post')),
				)
				.exists({ ultimabase: app }),
		).toBe(true)
	})

	it('executes owning and inverse traversal with normal Query semantics', async () => {
		const app = getUltimaBase()
		const [alpha, beta, gamma] = await Tag.createMany(
			[{ label: 'alpha' }, { label: 'beta' }, { label: 'gamma' }],
			{ ultimabase: app },
		)
		const article = await Article.create(
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

		expect(await tags.query().count({ ultimabase: app })).toBe(2)
		expect(await tags.query().exists({ ultimabase: app })).toBe(true)
		expect(
			(
				await tags
					.query()
					.where((where) => where.eq('label', 'alpha'))
					.ascending('label')
					.limit(1)
					.after()
					.select({ label: true })
					.find({ ultimabase: app })
			).map((tag) => tag.toJSON()),
		).toStrictEqual([{ label: 'alpha' }])
		expect(
			await alpha.relation('articles').query().count({ ultimabase: app }),
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
			await alpha.relation('articles').query().count({ ultimabase: app }),
		).toBe(0)
		await tags.disconnect(Tag.pointer(beta.id), { ultimabase: app })
		expect(
			(await tags.query().find({ ultimabase: app })).map(({ label }) => label),
		).toStrictEqual(['gamma'])

		rejectNextRelationUpdate = true
		await expect(
			tags.connect(Tag.pointer(alpha.id), { ultimabase: app }),
		).rejects.toBe(rollbackError)
		expect(await tags.query().count({ ultimabase: app })).toBe(1)

		await tags.clear({ ultimabase: app })
		expect(await tags.query().count({ ultimabase: app })).toBe(0)

		const inverseTag = await Tag.create(
			{ data: { label: 'inverse' } },
			{ ultimabase: app },
		)
		const inverseArticles = inverseTag.relation('articles')

		await inverseArticles.connect(Article.pointer(article.id), {
			ultimabase: app,
		})
		expect(await tags.query().count({ ultimabase: app })).toBe(1)
		await inverseArticles.disconnect(Article.pointer(article.id), {
			ultimabase: app,
		})
		expect(await tags.query().count({ ultimabase: app })).toBe(0)

		await tags.connect(Tag.pointer(gamma.id), { ultimabase: app })
		await gamma.delete({ ultimabase: app })
		expect(await tags.query().count({ ultimabase: app })).toBe(0)

		const cleanupTag = await Tag.create(
			{ data: { label: 'cleanup' } },
			{ ultimabase: app },
		)
		await tags.connect(Tag.pointer(cleanupTag.id), { ultimabase: app })
		await article.delete({ ultimabase: app })
		expect(
			await cleanupTag.relation('articles').query().count({ ultimabase: app }),
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

	it('reuses pointer storage for inverse relation reads and mutations', async () => {
		const app = getUltimaBase()
		const author = await Author.create(
			{ data: { name: 'Ada' } },
			{ ultimabase: app },
		)
		const post = await Post.create(
			{ data: { author: Author.pointer(author.id), title: 'Pointers' } },
			{ ultimabase: app },
		)
		const posts = author.relation('posts')

		expect(await posts.query().count({ ultimabase: app })).toBe(1)
		const included = await posts
			.query()
			.include('author', (query) => query.select({ name: true }))
			.find({ ultimabase: app })

		expect(included).toHaveLength(1)
		expect(included[0]?.title).toBe('Pointers')
		expect(included[0]?.author?.toJSON()).toStrictEqual({ name: 'Ada' })
		await posts.disconnect(Post.pointer(post.id), { ultimabase: app })
		expect(await posts.query().count({ ultimabase: app })).toBe(0)
		await posts.connect(Post.pointer(post.id), { ultimabase: app })
		expect(await posts.query().count({ ultimabase: app })).toBe(1)
	})

	it('denies relation traversal at the source field before returning targets', async () => {
		const app = getUltimaBase()
		const tag = await Tag.create(
			{ data: { label: 'private' } },
			{ ultimabase: app },
		)
		const article = await PrivateArticle.create(
			{ data: { title: 'Private relation' } },
			{ ultimabase: app },
		)

		await article
			.relation('tags')
			.connect(Tag.pointer(tag.id), { ultimabase: app })
		await expect(
			article.relation('tags').query().find({ ultimabase: app }),
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
