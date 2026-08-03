import { expectTypeOf, test } from 'vitest'

import { RequestContext } from '../../runtime/context/request-context.js'
import type { Query } from '../../query/query/query.js'
import type { InferQueryResult } from '../../query/query/result.js'
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
			where: { title: 'Hello' },
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
	// @ts-expect-error -- Upsert targets require at least one exact field value.
	void draft.upsert({ update: { set: { title: 'Updated' } }, where: {} })
	void draft.upsert({
		update: { set: { title: 'Updated' } },
		// @ts-expect-error -- Upsert equality values retain their exact field types.
		where: { title: 1 },
	})
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
		Promise<SchemaResult<
			typeof Post,
			Readonly<{ readonly id: string; readonly title: string }>
		> | null>
	>()
	expectTypeOf(selected.delete()).toEqualTypeOf<
		Promise<SchemaResult<
			typeof Post,
			Readonly<{ readonly id: string; readonly title: string }>
		> | null>
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
