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
	expectTypeOf(draft.published).toEqualTypeOf<boolean | undefined>()
	expectTypeOf(draft.profile?.displayName).toEqualTypeOf<string | undefined>()
	expectTypeOf(draft.tags).toEqualTypeOf<readonly string[] | undefined>()
	expectTypeOf(draft.embedding).toEqualTypeOf<readonly number[] | undefined>()
	expectTypeOf(draft.get('title')).toBeString()
	expectTypeOf(draft.toJSON()).toEqualTypeOf<
		Readonly<InferCreateInput<typeof Post>>
	>()
	expectTypeOf(draft.create()).toEqualTypeOf<
		Promise<SchemaResult<typeof Post>>
	>()
	expectTypeOf(
		draft.upsert({
			update: { set: { title: 'Updated' } },
			where: (where) => where.equalTo('title', 'Hello'),
		}),
	).toEqualTypeOf<Promise<SchemaResult<typeof Post>>>()

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
	// @ts-expect-error -- Upsert targets use the filter-only callback surface.
	void draft.upsert({ update: { set: { title: 'Updated' } }, where: {} })
	void draft.upsert({
		update: { set: { title: 'Updated' } },
		where: (where) =>
			// @ts-expect-error -- Upsert equality values retain their exact field types.
			where.equalTo('title', 1),
	})
})

test('exposes writes on the schema class and keeps Query read-only', () => {
	const readQuery = Post.query().equalTo('published', false)

	expectTypeOf(Post.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof Post>>
	>()
	expectTypeOf(
		Post.createMany([{ title: 'First' }, { title: 'Second' }]),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post>[]>>()
	expectTypeOf(
		Post.createMany([{ title: 'First' }], { atomic: false }),
	).toEqualTypeOf<Promise<NonAtomicBulkResult<InferQueryResult<typeof Post>>>>()
	expectTypeOf(
		Post.updateOne({
			where: (where) => where.byId('post-1'),
			data: { set: { title: 'Updated' } },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post> | null>>()
	expectTypeOf(
		Post.updateMany({
			where: (where) => where.equalTo('published', false),
			data: { set: { published: true } },
		}),
	).toEqualTypeOf<Promise<number>>()
	expectTypeOf(
		Post.deleteOne({
			where: (where) => where.byId('post-1'),
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post> | null>>()
	expectTypeOf(Post.deleteMany({ where: 'all' })).toEqualTypeOf<
		Promise<number>
	>()
	expectTypeOf(
		Post.upsert({
			where: (where) => where.equalTo('id', 'post-1'),
			create: { title: 'Created' },
			update: { set: { title: 'Updated' } },
		}),
	).toEqualTypeOf<Promise<InferQueryResult<typeof Post>>>()
	expectTypeOf(
		Post.upsertMany([
			{
				where: (where) => where.equalTo('id', 'post-1'),
				create: { title: 'Created' },
				update: { set: { title: 'Updated' } },
			},
		]),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof Post>[]>>()

	expectTypeOf(readQuery).not.toHaveProperty('create')
	expectTypeOf(readQuery).not.toHaveProperty('updateOne')
	expectTypeOf(readQuery).not.toHaveProperty('deleteMany')
	expectTypeOf(readQuery).not.toHaveProperty('upsert')
	expectTypeOf<SchemaWhere<typeof Post>>().not.toHaveProperty('select')
	expectTypeOf<SchemaWhere<typeof Post>>().not.toHaveProperty('find')
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
	const persisted = await draft.create()
	const queried = await Specialized.query().first()

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
	const query = Post.query().select('id', 'title')
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
	expectTypeOf(selected.update({ set: { title: 'Updated' } })).toEqualTypeOf<
		Promise<SchemaResult<typeof Post> | null>
	>()
	expectTypeOf(selected.delete()).toEqualTypeOf<
		Promise<SchemaResult<typeof Post> | null>
	>()
	expectTypeOf<SchemaResult<typeof Post>>().toHaveProperty('updatedAt')
	const context = RequestContext.anonymous({
		requestId: 'model-type-test',
		source: 'type-test',
	})

	void selected.update(
		{ set: { title: 'Master update' } },
		{ context, useMasterKey: true },
	)
	void selected.delete({ useMasterKey: true })
	expectTypeOf(selected).not.toHaveProperty('create')
	expectTypeOf(selected).not.toHaveProperty('upsert')
	// @ts-expect-error -- Selected models never expose omitted schema fields.
	selected.get('profile')
})
