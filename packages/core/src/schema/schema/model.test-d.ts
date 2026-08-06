import { expectTypeOf, test } from 'vitest'

import { RequestContext } from '../../runtime/context/request-context.js'
import type { Query } from '../../query/query/query.js'
import type { InferQueryResult } from '../../query/query/result.js'
import type { NonAtomicBulkResult } from '../../query/operations/contracts.js'
import type { SchemaWhere } from '../../query/operations/schema-commands.js'
import { booleanField } from '../fields/builtins/boolean.js'
import { objectField } from '../fields/builtins/object.js'
import { stringField } from '../fields/builtins/string.js'
import { definePluginField } from '../fields/plugin.js'
import type { InferCreateInput } from '../inference/types.js'
import { Schema } from './definition.js'
import type { SchemaDraft, SchemaResult } from './model.js'

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
	fields: {
		title: stringField({ validation: { required: true } }),
		published: booleanField({ default: false }),
		profile: objectField({
			fields: {
				displayName: stringField({ validation: { required: true } }),
			},
		}),
		tags: stringField({ list: true }),
		embedding: vectorField,
	},
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
	expectTypeOf(draft.create({})).toEqualTypeOf<
		Promise<SchemaResult<typeof Post>>
	>()
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
	).toEqualTypeOf<Promise<SchemaResult<typeof Post>>>()
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

test('exposes writes on the schema class and keeps Query read-only', () => {
	const readQuery = Post.query().where((where) => where.eq('published', false))

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
	expectTypeOf(
		Post.createMany({ data: [{ title: 'First' }] }, { atomic: false }),
	).toEqualTypeOf<Promise<NonAtomicBulkResult<InferQueryResult<typeof Post>>>>()
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
			where: { published: { eq: false } },
			data: { published: true },
		}),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post, 'id'>[]>>()
	expectTypeOf(
		Post.updateMany({
			where: { published: { eq: false } },
			data: { published: true },
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	// @ts-expect-error -- Bulk update selections reject undeclared fields.
	void Post.updateMany({
		where: 'all',
		data: { published: true },
		select: { missing: true },
	})
	// @ts-expect-error -- Dynamic booleans cannot promise an exact bulk update result.
	void Post.updateMany({
		where: 'all',
		data: { published: true },
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
	expectTypeOf(Post.deleteMany({ where: 'all' })).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id'>[]>
	>()
	expectTypeOf(
		Post.deleteMany({
			where: 'all',
			select: { id: true, title: true },
		}),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof Post, 'id' | 'title'>[]>
	>()
	// @ts-expect-error -- Bulk delete selections reject undeclared fields.
	void Post.deleteMany({ where: 'all', select: { missing: true } })
	// @ts-expect-error -- Dynamic booleans cannot promise an exact bulk delete result.
	void Post.deleteMany({
		where: 'all',
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
		{ className: 'TypedCapability', fields: { title: stringField() } },
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
	const queried = await Specialized.query().findOne()

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
		fields: {
			title: stringField({ validation: { required: true } }),
		},
	})
	expectTypeOf(Minimal.className).toEqualTypeOf<'Minimal'>()

	expectTypeOf<SchemaDraft<typeof Minimal>>().not.toExtend<
		InferQueryResult<typeof Minimal, 'title'>
	>()
	expectTypeOf<InferQueryResult<typeof Minimal, 'title'>>().not.toExtend<
		SchemaDraft<typeof Minimal>
	>()
})

test('retains exact schema and selection types through static Query access', () => {
	const query = Post.query().select({ id: true, title: true })
	const selected = null as unknown as InferQueryResult<
		typeof Post,
		'id' | 'title'
	>

	expectTypeOf(query).toEqualTypeOf<Query<typeof Post, 'id' | 'title'>>()
	expectTypeOf(query.schema).toEqualTypeOf<typeof Post>()
	expectTypeOf(selected.get('title')).toBeString()
	expectTypeOf(selected.toJSON()).toEqualTypeOf<
		Readonly<{ readonly id: string; readonly title: string }>
	>()
	expectTypeOf(selected.update({ data: { title: 'Updated' } })).toEqualTypeOf<
		Promise<SchemaResult<typeof Post> | null>
	>()
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
	expectTypeOf(selected.delete({})).toEqualTypeOf<
		Promise<SchemaResult<typeof Post> | null>
	>()
	expectTypeOf(selected.delete({ select: { id: true, title: true } })).toExtend<
		Promise<InferQueryResult<typeof Post, 'id' | 'title'> | null>
	>()
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
	// @ts-expect-error -- Instance update data stays inside its command envelope.
	void selected.update({ title: 'Legacy update shape' })
	expectTypeOf(selected).not.toHaveProperty('create')
	expectTypeOf(selected).not.toHaveProperty('upsert')
	// @ts-expect-error -- Selected models never expose omitted schema fields.
	selected.get('profile')
})
