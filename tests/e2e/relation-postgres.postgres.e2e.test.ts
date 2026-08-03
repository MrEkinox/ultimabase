import {
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
import { postgresPlugin } from '@ultimabase/postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const relationTrace: string[] = []
const rollbackError = new Error('relation mutation rollback fixture')
let rejectNextRelationUpdate = false

type ArticleSchema = SchemaClass<
	'RelationE2EArticle',
	Readonly<{
		readonly title: ReturnType<typeof stringField>
		readonly tags: RelationField<TagSchema, undefined>
	}>,
	readonly []
>

type TagSchema = SchemaClass<
	'RelationE2ETag',
	Readonly<{
		readonly label: ReturnType<typeof stringField>
		readonly articles: RelationField<ArticleSchema, 'tags'>
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
		title: stringField({ validation: { required: true } }),
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
	fields: {
		articles: relationField({
			mappedBy: 'tags',
			target: (): ArticleSchema => Article,
		}),
		label: stringField({ validation: { required: true } }),
	},
	hooks: {
		afterFind: ({ result }) => {
			relationTrace.push('tag:afterFind')

			return result
		},
		beforeFind: ({ query }) => {
			relationTrace.push('tag:beforeFind')

			return query
		},
	},
})

type OptionalPointerState = ScalarFieldInferenceState<
	false,
	true,
	false,
	false,
	false
>

type AuthorSchema = SchemaClass<
	'RelationE2EAuthor',
	Readonly<{
		readonly name: ReturnType<typeof stringField>
		readonly posts: RelationField<PostSchema, 'author'>
	}>,
	readonly []
>

type PostSchema = SchemaClass<
	'RelationE2EPost',
	Readonly<{
		readonly author: PointerField<AuthorSchema, OptionalPointerState>
		readonly title: ReturnType<typeof stringField>
	}>,
	readonly []
>

function resolvePost(): PostSchema {
	return Post
}

const Author: AuthorSchema = Schema.define({
	className: 'RelationE2EAuthor',
	fields: {
		name: stringField({ validation: { required: true } }),
		posts: relationField({ mappedBy: 'author', target: resolvePost }),
	},
})

const Post: PostSchema = Schema.define({
	className: 'RelationE2EPost',
	fields: {
		author: pointerField({
			onDelete: 'setNull',
			target: (): AuthorSchema => Author,
			validation: { nullable: true },
		}),
		title: stringField({ validation: { required: true } }),
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
	it('executes owning and inverse traversal with normal Query semantics', async () => {
		const app = getUltimaBase()
		const [alpha, beta, gamma] = await Tag.query().createMany(
			[{ label: 'alpha' }, { label: 'beta' }, { label: 'gamma' }],
			{ ultimabase: app },
		)
		const article = await Article.query().create(
			{ title: 'Relations' },
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
					.equalTo('label', 'alpha')
					.ascending('label')
					.limit(1)
					.after()
					.select('label')
					.find({ ultimabase: app })
			).map((tag) => tag.toJSON()),
		).toStrictEqual([{ label: 'alpha' }])
		expect(
			await alpha.relation('articles').query().count({ ultimabase: app }),
		).toBe(1)
		expect(relationTrace).toEqual(
			expect.arrayContaining([
				'article:tags:read:count',
				'tag:beforeFind',
				'tag:afterFind',
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

		const inverseTag = await Tag.query().create(
			{ label: 'inverse' },
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

		const cleanupTag = await Tag.query().create(
			{ label: 'cleanup' },
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
		const author = await Author.query().create(
			{ name: 'Ada' },
			{ ultimabase: app },
		)
		const post = await Post.query().create(
			{ author: Author.pointer(author.id), title: 'Pointers' },
			{ ultimabase: app },
		)
		const posts = author.relation('posts')

		expect(await posts.query().count({ ultimabase: app })).toBe(1)
		await posts.disconnect(Post.pointer(post.id), { ultimabase: app })
		expect(await posts.query().count({ ultimabase: app })).toBe(0)
		await posts.connect(Post.pointer(post.id), { ultimabase: app })
		expect(await posts.query().count({ ultimabase: app })).toBe(1)
	})

	it('denies relation traversal at the source field before returning targets', async () => {
		const app = getUltimaBase()
		const tag = await Tag.query().create(
			{ label: 'private' },
			{ ultimabase: app },
		)
		const article = await PrivateArticle.query().create(
			{ title: 'Private relation' },
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
