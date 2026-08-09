import { expectTypeOf, test } from 'vitest'

import { RequestContext } from '../../runtime/context/request-context.js'
import { QueryBuilder } from '../../query/query/query.js'
import type { InferQueryResult } from '../../query/query/result.js'
import type { SchemaWhere } from '../../query/operations/schema-commands.js'
import { definePluginField } from '../fields/plugin.js'
import type { InferCreateInput, InferObject } from '../inference/types.js'
import type { Pointer } from '../relations/pointer.js'
import { Schema } from './definition.js'
import type { SchemaDraft, SchemaPreparedDraft, SchemaResult } from './model.js'

const vectorField = definePluginField(
	'fixture.vector',
	{},
	{
		snapshotValue: (value: unknown): readonly number[] => {
			// This type test needs only the plugin-owned logical value contract.
			void value
			return []
		},
	},
)

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		published: field.boolean({ default: false }),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string({ validation: { required: true } }),
			}),
		}),
		tags: field.string({ list: true }),
		embedding: vectorField,
	}),
})

const Author = Schema.define({
	className: 'Author',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})

const Article = Schema.define({
	className: 'Article',
	fields: (field) => ({
		author: field.pointer({
			target: () => Author,
			validation: { required: true },
		}),
		title: field.string({ validation: { required: true } }),
	}),
})

const Comment = Schema.define({
	className: 'Comment',
	fields: (field) => ({
		body: field.string({ validation: { required: true } }),
		author: field.pointer({ target: () => Author }),
	}),
})

const Discussion = Schema.define({
	className: 'Discussion',
	fields: (field) => ({
		comments: field.relation({ target: () => Comment }),
		title: field.string({ validation: { required: true } }),
	}),
})

test('infers exact immutable drafts from the generated constructor', () => {
	const draft = new Post({
		profile: { displayName: 'Ada' },
		title: 'Hello',
	})

	expectTypeOf(draft).toEqualTypeOf<SchemaDraft<typeof Post>>()
	expectTypeOf(draft.title).toBeString()
	expectTypeOf(draft.published).toEqualTypeOf<boolean | null | undefined>()
	expectTypeOf(draft.profile?.displayName).toEqualTypeOf<string | undefined>()
	expectTypeOf(draft.tags).toEqualTypeOf<readonly string[] | null | undefined>()
	expectTypeOf(draft.embedding).toEqualTypeOf<
		readonly number[] | null | undefined
	>()
	expectTypeOf(draft.get('title')).toBeString()
	expectTypeOf(draft.toJSON()).toEqualTypeOf<
		Readonly<InferCreateInput<typeof Post>>
	>()
	expectTypeOf(draft.create({})).toExtend<Promise<SchemaResult<typeof Post>>>()
	const selectedCreate = draft.create({ select: { id: true, title: true } })
	type SelectedCreate = Awaited<typeof selectedCreate>
	void selectedCreate
	expectTypeOf<ReturnType<SelectedCreate['toJSON']>>().toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	expectTypeOf<SelectedCreate>().not.toHaveProperty('published')
	expectTypeOf(
		draft.upsert({
			update: { title: 'Updated' },
			where: { title: { eq: 'Hello' } },
		}),
	).toExtend<Promise<SchemaResult<typeof Post>>>()
	expectTypeOf(
		draft.upsert({
			select: { id: true, title: true },
			update: { title: 'Updated' },
			where: (where) => where.eq('title', 'Hello'),
		}),
	).toExtend<Promise<InferQueryResult<typeof Post, 'id' | 'title'>>>()

	// @ts-expect-error -- Required create fields cannot be omitted.
	new Post({})
	// @ts-expect-error -- Framework-owned fields cannot forge a persisted instance.
	new Post({ id: 'forged', title: 'Hello' })
	// @ts-expect-error -- Draft properties remain readonly.
	draft.title = 'Changed'
	// @ts-expect-error -- get accepts only fields visible on this draft shape.
	draft.get('missing')
	expectTypeOf(draft).not.toHaveProperty('update')
	expectTypeOf(draft).not.toHaveProperty('delete')
	expectTypeOf(draft).not.toHaveProperty('fetch')
	expectTypeOf(draft).not.toHaveProperty('exists')
	expectTypeOf(draft).not.toHaveProperty('toPointer')
	expectTypeOf(draft).not.toHaveProperty('equals')
	void draft.upsert({
		update: { title: 'Updated' },
		where: { title: { eq: 'Hello' } },
	})
	void draft.upsert({
		update: { title: 'Updated' },
		where: (where) =>
			// @ts-expect-error -- Upsert equality values retain their exact field types.
			where.eq('title', 1),
	})
})

test('exposes complete prepared drafts without persistence commands', () => {
	type Prepared = SchemaPreparedDraft<typeof Post>

	expectTypeOf<Prepared['id']>().toBeString()
	expectTypeOf<Prepared['createdAt']>().toBeString()
	expectTypeOf<Prepared['title']>().toBeString()
	expectTypeOf<ReturnType<Prepared['toJSON']>>().toEqualTypeOf<
		Readonly<InferObject<typeof Post>>
	>()
	expectTypeOf<Prepared>().not.toHaveProperty('create')
	expectTypeOf<Prepared>().not.toHaveProperty('upsert')
	expectTypeOf<Prepared>().not.toHaveProperty('update')
	expectTypeOf<Prepared>().not.toHaveProperty('delete')
	expectTypeOf<Prepared>().not.toHaveProperty('fetch')
	expectTypeOf<Prepared>().not.toHaveProperty('exists')
})

test('exposes writes on the schema class and keeps QueryBuilder read-only', () => {
	const readQuery = new QueryBuilder(Post).where((where) =>
		where.eq('published', false),
	)

	expectTypeOf(Post.findMany()).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post>[]>
	>()
	expectTypeOf(
		Post.findMany({
			where: { published: { eq: true } },
			select: { id: true, title: true },
			orderBy: { createdAt: 'desc' },
			limit: 20,
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	void Post.findMany({ cursor: true })
	void Post.findMany({ cursor: true, select: { title: true } })
	// @ts-expect-error -- Offset and cursor pagination are mutually exclusive.
	void Post.findMany({ cursor: true, offset: 10 })
	// @ts-expect-error -- Offset is the only canonical offset-pagination name.
	void Post.findMany({ skip: 10 })
	expectTypeOf(
		Article.findOne({
			select: { id: true, title: true },
			include: {
				author: { select: { id: true, name: true } },
			},
		}),
	).toEqualTypeOf<
		Promise<InferQueryResult<
			typeof Article,
			'id' | 'title' | 'author',
			{
				readonly kind: 'pointer'
				readonly field: 'author'
				readonly target: typeof Author
				readonly selected: 'id' | 'name'
				readonly nested: never
			}
		> | null>
	>()
	expectTypeOf(
		Discussion.findMany({
			select: { id: true, title: true },
			include: {
				comments: {
					select: { body: true },
					where: { body: { ne: '' } },
					orderBy: { createdAt: 'desc' },
					limit: 5,
					offset: 10,
					include: { author: { select: { name: true } } },
				},
			},
		}),
	).toEqualTypeOf<
		Promise<
			readonly InferQueryResult<
				typeof Discussion,
				'id' | 'title',
				{
					readonly kind: 'relation'
					readonly field: 'comments'
					readonly target: typeof Comment
					readonly selected: 'body' | 'author'
					readonly nested: {
						readonly kind: 'pointer'
						readonly field: 'author'
						readonly target: typeof Author
						readonly selected: 'name'
						readonly nested: never
					}
				}
			>[]
		>
	>()
	// @ts-expect-error -- Relation includes do not expose cursor pagination.
	void Discussion.findMany({ include: { comments: { cursor: true } } })
	// @ts-expect-error -- Relation includes use offset rather than the legacy skip name.
	void Discussion.findMany({ include: { comments: { skip: 10 } } })
	// @ts-expect-error -- Singular pointer includes do not support collection offsets.
	void Article.findMany({ include: { author: { offset: 10 } } })
	expectTypeOf(
		Post.get({ id: 'post-1', select: { title: true } }),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post, 'title'>>>()
	expectTypeOf(
		Post.count({ where: { published: { eq: true } } }),
	).toEqualTypeOf<Promise<number>>()
	expectTypeOf(Post.exists({ where: {} })).toEqualTypeOf<Promise<boolean>>()
	// @ts-expect-error -- Read inputs reject unknown top-level clauses.
	void Post.findMany({ unknown: true })
	// @ts-expect-error -- Read selections reject undeclared fields.
	void Post.findMany({ select: { missing: true } })
	const dynamicReadSelection = Math.random() > 0.5
	// @ts-expect-error -- Dynamic flags cannot promise an exact read result.
	void Post.findMany({ select: { title: dynamicReadSelection } })
	// @ts-expect-error -- Ordering exposes only declared schema fields.
	void Post.findMany({ orderBy: { missing: 'asc' } })
	void Post.findMany({ orderBy: { title: 'asc', createdAt: 'desc' } })
	// @ts-expect-error -- Included targets retain exact field selection.
	void Article.findMany({ include: { author: { select: { missing: true } } } })

	expectTypeOf(Post.createOne({ data: { title: 'Created' } })).toEqualTypeOf<
		Promise<InferQueryResult<typeof Post>>
	>()
	expectTypeOf(
		Post.createOne({
			data: { title: 'Created' },
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post, 'id' | 'title'>>>()
	// @ts-expect-error -- Create selections reject undeclared fields.
	void Post.createOne({
		data: { title: 'Created' },
		select: { missing: true },
	})
	const dynamicCreateSelection = Math.random() > 0.5
	// @ts-expect-error -- Dynamic booleans cannot promise an exact create result type.
	void Post.createOne({
		data: { title: 'Created' },
		select: { title: dynamicCreateSelection },
	})
	// @ts-expect-error -- Static create uses one explicit command envelope.
	void Post.createOne({ title: 'Legacy shape' })
	expectTypeOf(
		Post.createMany({ data: [{ title: 'First' }, { title: 'Second' }] }),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post>[]>>()
	expectTypeOf(
		Post.createMany({
			data: [{ title: 'First' }],
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	// @ts-expect-error -- Bulk create selections reject undeclared fields.
	void Post.createMany({
		data: [{ title: 'First' }],
		select: { missing: true },
	})
	// @ts-expect-error -- Collection mutations are always atomic.
	void Post.createMany({ data: [{ title: 'First' }] }, { atomic: false })
	expectTypeOf(
		Post.updateOne({
			where: (where) => where.eq('id', 'post-1'),
			data: { title: 'Updated' },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post> | null>>()
	expectTypeOf(
		Post.updateOne({
			where: { id: { eq: 'post-1' } },
			data: { title: 'Updated' },
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<InferQueryResult<typeof Post, 'id' | 'title'> | null>
	>()
	// @ts-expect-error -- Mutation selections reject undeclared fields.
	void Post.updateOne({
		where: { id: { eq: 'post-1' } },
		data: { title: 'Updated' },
		select: { missing: true },
	})
	const dynamicSelection = Math.random() > 0.5
	// @ts-expect-error -- Dynamic booleans cannot promise an exact result type.
	void Post.updateOne({
		where: { id: { eq: 'post-1' } },
		data: { title: 'Updated' },
		select: { title: dynamicSelection },
	})
	expectTypeOf(
		Post.updateMany({
			data: [{ where: { id: { eq: 'post-1' } }, data: { published: true } }],
		}),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post, 'id'>[]>>()
	expectTypeOf(
		Post.updateMany({
			data: [{ where: { id: { eq: 'post-1' } }, data: { published: true } }],
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	// @ts-expect-error -- Bulk update selections reject undeclared fields.
	void Post.updateMany({
		data: [{ where: { id: { eq: 'post-1' } }, data: { published: true } }],
		select: { missing: true },
	})
	// @ts-expect-error -- Dynamic booleans cannot promise an exact bulk update result.
	void Post.updateMany({
		data: [{ where: { id: { eq: 'post-1' } }, data: { published: true } }],
		select: { title: dynamicSelection },
	})
	expectTypeOf(
		Post.deleteOne({
			where: (where) => where.eq('id', 'post-1'),
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post> | null>>()
	expectTypeOf(
		Post.deleteOne({
			where: { id: { eq: 'post-1' } },
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<InferQueryResult<typeof Post, 'id' | 'title'> | null>
	>()
	// @ts-expect-error -- Delete selections reject undeclared fields.
	void Post.deleteOne({
		where: { id: { eq: 'post-1' } },
		select: { missing: true },
	})
	const dynamicDeleteSelection = Math.random() > 0.5
	// @ts-expect-error -- Dynamic booleans cannot promise an exact delete result type.
	void Post.deleteOne({
		where: { id: { eq: 'post-1' } },
		select: { title: dynamicDeleteSelection },
	})
	expectTypeOf(
		Post.deleteMany({ where: [{ id: { eq: 'post-1' } }] }),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post, 'id'>[]>>()
	expectTypeOf(
		Post.deleteMany({
			where: [{ id: { eq: 'post-1' } }],
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	// @ts-expect-error -- Bulk delete selections reject undeclared fields.
	void Post.deleteMany({
		where: [{ id: { eq: 'post-1' } }],
		select: { missing: true },
	})
	// @ts-expect-error -- Dynamic booleans cannot promise an exact bulk delete result.
	void Post.deleteMany({
		where: [{ id: { eq: 'post-1' } }],
		select: { title: dynamicDeleteSelection },
	})
	expectTypeOf(
		Post.upsertOne({
			where: { id: { eq: 'post-1' } },
			create: { title: 'Created' },
			update: { title: 'Updated' },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post>>>()
	expectTypeOf(
		Post.upsertOne({
			where: { id: { eq: 'post-1' } },
			create: { title: 'Created' },
			update: { title: 'Updated' },
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post, 'id' | 'title'>>>()
	expectTypeOf(
		Post.upsertMany({
			data: [
				{
					where: { id: { eq: 'post-1' } },
					create: { title: 'Created' },
					update: { title: 'Updated' },
				},
			],
		}),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post>[]>>()
	expectTypeOf(
		Post.upsertMany({
			data: [
				{
					where: { id: { eq: 'post-1' } },
					create: { title: 'Created' },
					update: { title: 'Updated' },
				},
			],
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()

	expectTypeOf(readQuery).not.toHaveProperty('create')
	expectTypeOf(readQuery).not.toHaveProperty('updateOne')
	expectTypeOf(readQuery).not.toHaveProperty('deleteMany')
	expectTypeOf(readQuery).not.toHaveProperty('upsert')
	expectTypeOf<SchemaWhere<typeof Post>>().not.toHaveProperty('select')
	expectTypeOf<SchemaWhere<typeof Post>>().not.toHaveProperty('findMany')
	// @ts-expect-error -- Set-based mutations require an explicit predicate or `all`.
	void Post.deleteMany({})
})

test('infers package-owned commands only on persisted results', async () => {
	const Specialized = Schema.defineWithCapabilities(
		{
			className: 'TypedCapability',
			fields: (field) => ({ title: field.string() }),
		},
		() => ({
			statics: { category: 'fixture' as const },
			results: {
				publish(): Promise<void> {
					return Promise.resolve()
				},
			},
		}),
	)
	const draft = new Specialized({ title: 'Draft' })
	const persisted = await draft.create({})
	const queried = await Specialized.findOne()

	expectTypeOf(Specialized.category).toEqualTypeOf<'fixture'>()
	expectTypeOf(draft).not.toHaveProperty('publish')
	expectTypeOf(persisted.publish()).toEqualTypeOf<Promise<void>>()

	if (queried !== null) {
		expectTypeOf(queried.publish()).toEqualTypeOf<Promise<void>>()
	}
})

test('distinguishes draft and persisted states for the same visible fields', () => {
	const Minimal = Schema.define({
		className: 'Minimal',
		fields: (field) => ({
			title: field.string({ validation: { required: true } }),
		}),
	})
	expectTypeOf(Minimal.className).toEqualTypeOf<'Minimal'>()

	expectTypeOf<SchemaDraft<typeof Minimal>>().not.toExtend<
		InferQueryResult<typeof Minimal, 'title'>
	>()
	expectTypeOf<InferQueryResult<typeof Minimal, 'title'>>().not.toExtend<
		SchemaDraft<typeof Minimal>
	>()
})

test('retains exact schema and selection types through QueryBuilder inputs', () => {
	const query = new QueryBuilder(Post).select({ id: true, title: true })
	const selected = null as unknown as InferQueryResult<
		typeof Post,
		'id' | 'title'
	>

	expectTypeOf(query).toEqualTypeOf<QueryBuilder<typeof Post, 'id' | 'title'>>()
	expectTypeOf(query.schema).toEqualTypeOf<typeof Post>()
	expectTypeOf(selected.get('title')).toBeString()
	expectTypeOf(selected.toJSON()).toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	const completeUpdate = selected.update({ data: { title: 'Updated' } })
	type CompleteUpdate = NonNullable<Awaited<typeof completeUpdate>>
	void completeUpdate
	expectTypeOf<ReturnType<CompleteUpdate['toJSON']>>().toEqualTypeOf<
		ReturnType<SchemaResult<typeof Post>['toJSON']>
	>()
	const chainedPointer = null as unknown as ReturnType<
		CompleteUpdate['toPointer']
	>
	const exactChainedPointer: Pointer<typeof Post> = chainedPointer
	void exactChainedPointer
	const selectedUpdate = selected.update({
		data: { title: 'Updated' },
		select: { id: true, title: true },
	})
	type SelectedUpdate = NonNullable<Awaited<typeof selectedUpdate>>
	void selectedUpdate
	expectTypeOf<ReturnType<SelectedUpdate['toJSON']>>().toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	expectTypeOf<SelectedUpdate>().not.toHaveProperty('published')
	const completeDelete = selected.delete({})
	type CompleteDelete = NonNullable<Awaited<typeof completeDelete>>
	void completeDelete
	expectTypeOf<ReturnType<CompleteDelete['toJSON']>>().toEqualTypeOf<
		ReturnType<SchemaResult<typeof Post>['toJSON']>
	>()
	const selectedDelete = selected.delete({
		select: { id: true, title: true },
	})
	type SelectedDelete = NonNullable<Awaited<typeof selectedDelete>>
	void selectedDelete
	expectTypeOf<ReturnType<SelectedDelete['toJSON']>>().toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	const completeFetch = selected.fetch({})
	type CompleteFetch = NonNullable<Awaited<typeof completeFetch>>
	void completeFetch
	expectTypeOf<ReturnType<CompleteFetch['toJSON']>>().toEqualTypeOf<
		ReturnType<SchemaResult<typeof Post>['toJSON']>
	>()
	const selectedFetch = selected.fetch({
		select: { id: true, title: true },
	})
	type SelectedFetch = NonNullable<Awaited<typeof selectedFetch>>
	void selectedFetch
	expectTypeOf<ReturnType<SelectedFetch['toJSON']>>().toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	expectTypeOf<SelectedFetch>().not.toHaveProperty('published')
	expectTypeOf(selected.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(selected.toPointer()).toEqualTypeOf<Pointer<typeof Post>>()
	expectTypeOf(selected.equals(selected)).toBeBoolean()
	expectTypeOf(selected.equals(Post.pointer('post-1'))).toBeBoolean()
	expectTypeOf<SchemaResult<typeof Post>>().toHaveProperty('updatedAt')
	const context = RequestContext.anonymous({
		requestId: 'model-type-test',
		source: 'type-test',
	})

	void selected.update(
		{ data: { title: 'Master update' } },
		{ context, useMasterKey: true },
	)
	void selected.delete({}, { useMasterKey: true })
	// @ts-expect-error -- Instance selections reject undeclared fields.
	void selected.delete({ select: { missing: true } })
	// @ts-expect-error -- Fetch selections reject undeclared fields.
	void selected.fetch({ select: { missing: true } })
	const dynamicFetchSelection = Math.random() > 0.5
	// @ts-expect-error -- Dynamic booleans cannot promise an exact fetch result.
	void selected.fetch({ select: { title: dynamicFetchSelection } })
	// @ts-expect-error -- Instance update data stays inside its command envelope.
	void selected.update({ title: 'Legacy update shape' })
	expectTypeOf(selected).not.toHaveProperty('create')
	expectTypeOf(selected).not.toHaveProperty('upsert')
	// @ts-expect-error -- Selected models never expose omitted schema fields.
	selected.get('profile')
})
