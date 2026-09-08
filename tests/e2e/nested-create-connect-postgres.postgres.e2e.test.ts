import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	type NestedWriteGraph,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const trace: string[] = []
let denyTagRelationWrite = false
let denyTagCreate = false
let observedAuthorGraph: NestedWriteGraph | undefined
let observedPostBeforeGraph: NestedWriteGraph | undefined
let observedPostAfterGraph: NestedWriteGraph | undefined

const Author = Schema.define({
	className: 'NestedCreateAuthor',
	access: {
		read: { where: ({ where }) => where.eq('visible', true) },
	},
	fields: (field) => ({
		name: field.string({ required: true }),
		visible: field.boolean({ default: true }),
	}),
	hooks: {
		afterOperation: {
			create: ({ nestedWrite }) => {
				observedAuthorGraph = nestedWrite
				trace.push('author:after')
			},
		},
		beforeOperation: {
			create: () => {
				trace.push('author:before')
			},
		},
	},
})

const Tag = Schema.define({
	className: 'NestedCreateTag',
	access: { create: () => !denyTagCreate },
	fields: (field) => ({
		creator: field.pointer({ target: 'NestedCreateAuthor' }),
		label: field.string({ required: true }),
	}),
	hooks: {
		afterOperation: {
			create: () => {
				trace.push('tag:after')
			},
		},
		beforeOperation: {
			create: () => {
				trace.push('tag:before')
			},
		},
	},
})

const Comment = Schema.define({
	className: 'NestedCreateComment',
	fields: (field) => ({
		body: field.string({ required: true }),
		post: field.pointer({ required: true, target: 'NestedCreatePost' }),
	}),
	hooks: {
		afterOperation: {
			create: () => {
				trace.push('comment:after')
			},
		},
		beforeOperation: {
			create: () => {
				trace.push('comment:before')
			},
		},
	},
})

const Post = Schema.define({
	className: 'NestedCreatePost',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'NestedCreateAuthor' }),
		comments: field.relation({
			mappedBy: 'post',
			target: 'NestedCreateComment',
		}),
		tags: field.relation({
			access: {
				write: ({ change }) => {
					trace.push(`post:tags:${change.action}`)
					return !denyTagRelationWrite
				},
			},
			target: 'NestedCreateTag',
		}),
		title: field.string({ required: true }),
	}),
	hooks: {
		afterOperation: {
			create: ({ nestedWrite }) => {
				observedPostAfterGraph = nestedWrite
				trace.push('post:after')
			},
		},
		beforeOperation: {
			create: ({ nestedWrite }) => {
				observedPostBeforeGraph = nestedWrite
				trace.push('post:before')
			},
		},
	},
})

const schemas = [Author, Tag, Comment, Post] as const
let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [
				ReturnType<typeof hooksPlugin>,
				ReturnType<typeof accessPlugin>,
				ReturnType<typeof postgresPlugin>,
			]
	  >
	| undefined

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Nested-write PostgreSQL application has not started')
	}
	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'nested-create-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			hooksPlugin(),
			accessPlugin({ default: true }),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
		schemas,
		validation: { timezone: 'UTC' },
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

afterEach(() => {
	denyTagCreate = false
	denyTagRelationWrite = false
})

describe(
	'nested create and connect with PostgreSQL',
	{ concurrent: false },
	() => {
		it('executes pointer, owning relation, and inverse relation work in lifecycle order', async () => {
			const app = getUltimaBase()
			const existingTag = await Tag.createOne(
				{ data: { label: 'Existing' } },
				{ ultimabase: app },
			)
			trace.length = 0
			observedAuthorGraph = undefined
			observedPostBeforeGraph = undefined
			observedPostAfterGraph = undefined

			const created = await Post.createOne(
				{
					data: {
						author: { create: { name: 'Ada' } },
						comments: { create: [{ body: 'First' }] },
						tags: {
							connect: [existingTag.id],
							create: [
								{
									creator: { create: { name: 'Grace' } },
									label: 'Created',
								},
							],
						},
						title: 'Nested post',
					},
					include: {
						author: {},
						comments: {},
						tags: { include: { creator: {} } },
					},
				},
				{ ultimabase: app },
			)

			const includedAuthor: unknown = created.author
			const includedComments: unknown = created.comments
			const includedTags: unknown = created.tags
			if (
				!(includedAuthor instanceof Author) ||
				!Array.isArray(includedComments) ||
				!includedComments.every((comment) => comment instanceof Comment) ||
				!Array.isArray(includedTags) ||
				!includedTags.every((tag) => tag instanceof Tag)
			) {
				throw new TypeError('Expected every nested relationship inclusion')
			}
			expect(includedAuthor.name).toBe('Ada')
			expect(includedComments.map((comment) => comment.body)).toEqual(['First'])
			expect(includedTags.map((tag) => tag.label).sort()).toEqual([
				'Created',
				'Existing',
			])
			const createdTag = includedTags.find((tag) => tag.label === 'Created')
			if (createdTag === undefined || !(createdTag.creator instanceof Author)) {
				throw new TypeError('Expected the multi-level nested creator inclusion')
			}
			expect(createdTag.creator.name).toBe('Grace')
			expect(trace).toEqual([
				'post:tags:create',
				'post:tags:connect',
				'author:before',
				'author:after',
				'post:before',
				'comment:before',
				'comment:after',
				'author:before',
				'author:after',
				'tag:before',
				'tag:after',
				'post:after',
			])
			expect(observedAuthorGraph).toBe(observedPostBeforeGraph)
			expect(observedPostAfterGraph).toBe(observedPostBeforeGraph)
			expect(observedPostAfterGraph).toMatchObject({
				kind: 'nested-write-graph',
				operationCount: 10,
				root: { schema: Post },
			})
			expect(Object.isFrozen(observedPostAfterGraph)).toBe(true)
		})

		it('rolls back the complete graph when source relation Access denies it', async () => {
			const app = getUltimaBase()
			denyTagRelationWrite = true
			trace.length = 0

			await expect(
				Post.createOne(
					{
						data: {
							author: { create: { name: 'Denied author' } },
							tags: { create: [{ label: 'Denied tag' }] },
							title: 'Denied post',
						},
					},
					{ ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

			expect(trace).toEqual(['post:tags:create'])
			expect(
				await Author.findMany(
					{
						where: { name: { eq: 'Denied author' } },
					},
					{ ultimabase: app },
				),
			).toEqual([])
			expect(
				await Post.findMany(
					{
						where: { title: { eq: 'Denied post' } },
					},
					{ ultimabase: app },
				),
			).toEqual([])
			expect(
				await Tag.findMany(
					{
						where: { label: { eq: 'Denied tag' } },
					},
					{ ultimabase: app },
				),
			).toEqual([])
		})

		it('makes absent and policy-hidden connect targets indistinguishable', async () => {
			const app = getUltimaBase()
			const hidden = await Author.createOne(
				{ data: { name: 'Hidden target', visible: false } },
				{ ultimabase: app },
			)
			trace.length = 0

			for (const id of [hidden.id, '0199c2d0-0000-7000-8000-000000000099']) {
				await expect(
					Post.createOne(
						{
							data: {
								author: { connect: id },
								title: `Unavailable ${id}`,
							},
						},
						{ ultimabase: app },
					),
				).rejects.toMatchObject({ code: 'NOT_FOUND' })
			}

			expect(trace).toEqual([])
			expect(
				await Post.findMany(
					{ where: { title: { startsWith: 'Unavailable' } } },
					{ ultimabase: app },
				),
			).toEqual([])
		})

		it('rolls a persisted root back when a nested child Access rule denies it', async () => {
			const app = getUltimaBase()
			denyTagCreate = true
			trace.length = 0

			await expect(
				Post.createOne(
					{
						data: {
							author: { create: { name: 'Child denial author' } },
							tags: { create: [{ label: 'Child denial tag' }] },
							title: 'Child denial post',
						},
					},
					{ ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

			expect(trace).toEqual([
				'post:tags:create',
				'author:before',
				'author:after',
				'post:before',
			])
			expect(
				await Author.findMany(
					{ where: { name: { eq: 'Child denial author' } } },
					{ ultimabase: app },
				),
			).toEqual([])
			expect(
				await Post.findMany(
					{ where: { title: { eq: 'Child denial post' } } },
					{ ultimabase: app },
				),
			).toEqual([])
		})

		it('inherits Master authority while retaining every nested Hook lifecycle', async () => {
			const app = getUltimaBase()
			denyTagRelationWrite = true
			denyTagCreate = true
			trace.length = 0

			const created = await Post.createOne(
				{
					data: {
						author: { create: { name: 'Master author' } },
						tags: { create: [{ label: 'Master tag' }] },
						title: 'Master post',
					},
				},
				{ ultimabase: app, useMasterKey: true },
			)
			expect(created.title).toBe('Master post')
			expect(trace).toEqual([
				'author:before',
				'author:after',
				'post:before',
				'tag:before',
				'tag:after',
				'post:after',
			])
		})
	},
)
