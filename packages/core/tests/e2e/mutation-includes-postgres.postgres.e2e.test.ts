import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { UltimaBase } from '@ultimabase/core'
import type { PluginSourceState } from '@ultimabase/core/plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { RecordingPostgresPool } from '../../../../tests/fixtures/recording-postgres-pool.js'
import { isPlainResult } from '../../../../tests/fixtures/plain-results.js'

const projectionAccessError = new Error(
	'mutation inclusion target Access rejected the projection',
)
// Counts the Author reads still allowed before the projection is rejected.
let authorReadsBeforeRejection: number | undefined
const MutationIncludeApplication = UltimaBase.use(accessPlugin())

const Author = MutationIncludeApplication.Schema.define({
	className: 'MutationIncludeAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({
			mappedBy: 'author',
			target: 'MutationIncludePost',
		}),
	}),
	access: {
		read: () => {
			if (authorReadsBeforeRejection === 0) throw projectionAccessError
			if (authorReadsBeforeRejection !== undefined) {
				authorReadsBeforeRejection -= 1
			}

			return true
		},
	},
})

const Post = MutationIncludeApplication.Schema.define({
	className: 'MutationIncludePost',
	fields: (field) => ({
		author: field.pointer({
			target: 'MutationIncludeAuthor',
			required: true,
		}),
		title: field.string({ required: true }),
	}),
})

const Tag = MutationIncludeApplication.Schema.define({
	className: 'MutationIncludeTag',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
})

const Article = MutationIncludeApplication.Schema.define({
	className: 'MutationIncludeArticle',
	fields: (field) => ({
		tags: field.relation({ target: 'MutationIncludeTag' }),
		title: field.string({ required: true }),
	}),
})

const schemas = [Author, Post, Tag, Article] as const

let fixture: PostgresWorkerFixture | undefined
let pool: RecordingPostgresPool | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [ReturnType<typeof postgresPlugin>],
			PluginSourceState
	  >
	| undefined

const getApplication = () => {
	if (ultimabase === undefined || pool === undefined) {
		throw new TypeError('Mutation inclusion PostgreSQL fixture has not started')
	}

	return { pool, ultimabase }
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'mutation_include' })
	pool = new RecordingPostgresPool(fixture.pool)
	ultimabase = new (UltimaBase.use(
		accessPlugin({ allowWithoutRule: { all: true } }),
		postgresPlugin({ pool, schemaPolicy: 'override' }),
	))({ schemas })

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

describe('mutation relationship projections with PostgreSQL', () => {
	it('projects singular pointer, relation, and nested results once', async () => {
		const { pool: countingPool } = getApplication()
		const author = await Author.createOne({ data: { name: 'Singular author' } })

		countingPool.reset()
		// This runtime projection deliberately exercises a circular named graph;
		// its exact editor contract belongs to the retained Typegen graph tests.
		const createPostWithProjection = Post.createOne.bind(Post) as unknown as (
			input: unknown,
		) => Promise<unknown>
		const created = await createPostWithProjection({
			data: {
				author: { connect: author.id },
				title: 'Singular post',
			},
			select: { title: true },
			include: {
				author: {
					select: { name: true },
					include: { posts: { select: { title: true } } },
				},
			},
		})

		// One protected connect lookup precedes the single projection query.
		expect(countingPool.selectCount()).toBe(2)
		if (typeof created !== 'object' || created === null) {
			throw new TypeError('Expected the singular created post model')
		}
		expect(typeof Reflect.get(created, 'id')).toBe('string')
		const includedAuthor: unknown = Reflect.get(created, 'author')
		if (!isPlainResult(includedAuthor)) {
			throw new TypeError('Expected the singular included author model')
		}
		expect(Reflect.get(includedAuthor, 'name')).toBe('Singular author')
		expect(Reflect.get(includedAuthor, 'id')).toBe(author.id)
		const nestedPosts: unknown = Reflect.get(includedAuthor, 'posts')
		if (!Array.isArray(nestedPosts) || !isPlainResult(nestedPosts[0])) {
			throw new TypeError('Expected the nested included post collection')
		}
		expect(
			nestedPosts.map((candidate: unknown) => {
				if (!isPlainResult(candidate)) {
					throw new TypeError('Expected every nested included post model')
				}
				const title: unknown = Reflect.get(candidate, 'title')
				const id: unknown = Reflect.get(candidate, 'id')

				if (typeof id !== 'string' || typeof title !== 'string') {
					throw new TypeError('Expected every nested included post identity')
				}

				return title
			}),
		).toStrictEqual(['Singular post'])

		const tag = await Tag.createOne({ data: { label: 'Mutation tag' } })
		const article = await Article.createOne({
			data: { title: 'Before update' },
		})
		await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { tags: { connect: [tag.id] } },
		})

		countingPool.reset()
		const updated = await Article.updateOne({
			where: { id: { eq: article.id } },
			data: { title: 'After update' },
			select: { title: true },
			include: { tags: { select: { label: true } } },
		})

		expect(countingPool.selectCount()).toBe(2)
		if (updated === null) {
			throw new TypeError('Expected the singular updated article')
		}
		expect(updated.id).toBe(article.id)
		const includedTags: unknown = updated.tags
		if (!Array.isArray(includedTags) || !isPlainResult(includedTags[0])) {
			throw new TypeError('Expected the singular included relation collection')
		}
		expect(
			includedTags.map((candidate: unknown) => {
				if (!isPlainResult(candidate)) {
					throw new TypeError('Expected every singular included tag model')
				}
				const label: unknown = Reflect.get(candidate, 'label')
				const id: unknown = Reflect.get(candidate, 'id')

				if (typeof id !== 'string' || typeof label !== 'string') {
					throw new TypeError('Expected every singular included tag identity')
				}

				return label
			}),
		).toStrictEqual(['Mutation tag'])
	})

	it('uses one grouped projection and restores collection declaration order', async () => {
		const { pool: countingPool } = getApplication()
		const [firstAuthor, secondAuthor] = await Author.createMany({
			data: [{ name: 'Grouped first' }, { name: 'Grouped second' }],
		})

		if (firstAuthor === undefined || secondAuthor === undefined) {
			throw new TypeError('Expected both grouped authors')
		}

		countingPool.reset()
		const created = await Post.createMany({
			data: [
				{
					author: { connect: Author.pointer(firstAuthor.id) },
					title: 'Grouped first post',
				},
				{
					author: { connect: Author.pointer(secondAuthor.id) },
					title: 'Grouped second post',
				},
			],
			select: { title: true },
			include: { author: { select: { name: true } } },
		})

		// Two `connect` target reads (ADR-0308), then one grouped projection.
		expect(countingPool.selectCount()).toBe(3)
		expect(created.map(({ title }) => title)).toStrictEqual([
			'Grouped first post',
			'Grouped second post',
		])
		expect(created.every(({ id }) => typeof id === 'string')).toBe(true)
		expect(
			created.map((post) => {
				const includedAuthor: unknown = post.author

				return isPlainResult(includedAuthor) ? includedAuthor.name : undefined
			}),
		).toStrictEqual(['Grouped first', 'Grouped second'])

		countingPool.reset()
		const updated = await Post.updateMany({
			data: [created[1], created[0]].map((post, index) => {
				if (post === undefined) {
					throw new TypeError('Expected every grouped post result')
				}

				return {
					where: { id: { eq: post.id } },
					data: { title: `Grouped updated ${String(index + 1)}` },
				}
			}),
			select: { title: true },
			include: { author: { select: { name: true } } },
		})

		expect(countingPool.selectCount()).toBe(3)
		expect(updated.map(({ title }) => title)).toStrictEqual([
			'Grouped updated 1',
			'Grouped updated 2',
		])
		expect(updated.every(({ id }) => typeof id === 'string')).toBe(true)
		expect(
			updated.map((post) => {
				const includedAuthor: unknown = post.author

				return isPlainResult(includedAuthor) ? includedAuthor.name : undefined
			}),
		).toStrictEqual(['Grouped second', 'Grouped first'])
	})

	it('rolls back every grouped write when target Access rejects projection', async () => {
		const { pool: countingPool } = getApplication()
		const author = await Author.createOne({ data: { name: 'Rollback author' } })

		countingPool.reset()
		// The two `connect` target reads pass (ADR-0308); the projection fails.
		authorReadsBeforeRejection = 2

		try {
			await expect(
				Post.createMany({
					data: [
						{
							author: { connect: Author.pointer(author.id) },
							title: 'Rollback first',
						},
						{
							author: { connect: Author.pointer(author.id) },
							title: 'Rollback second',
						},
					],
					include: { author: { select: { name: true } } },
					select: { title: true },
				}),
			).rejects.toBe(projectionAccessError)
		} finally {
			authorReadsBeforeRejection = undefined
		}

		expect(
			countingPool.statements.filter((statement) =>
				statement.trimStart().toLowerCase().startsWith('insert'),
			),
		).toHaveLength(2)
		expect(countingPool.statements).toContain('ROLLBACK')
		await expect(
			Post.count({ where: { title: { startsWith: 'Rollback' } } }),
		).resolves.toBe(0)
	})
})
