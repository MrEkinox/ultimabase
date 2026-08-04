import {
	definePluginField,
	objectField,
	pointerField,
	Schema,
	stringField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type Pointer,
	type PointerValue,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	acl,
	type ACLCreateInputResolution,
	type ACLSchemaExtension,
	type ACLUpdateInputResolution,
} from './acl-extension.js'
import { ACL } from './acl.js'

test('adds concise ACL types to schema object, create, and update inference', () => {
	const protectedObjects = acl()
	const Post = Schema.define({
		className: 'ProtectedPost',
		fields: {
			title: stringField({ validation: { required: true } }),
		},
		extensions: [protectedObjects],
	})

	expectTypeOf(protectedObjects).toExtend<ACLSchemaExtension>()
	expectTypeOf(Post.fields.acl.kind).toEqualTypeOf<'ultimabase.acl'>()
	expectTypeOf<InferObject<typeof Post>['acl']>().toEqualTypeOf<ACL>()
	expectTypeOf<InferCreateInput<typeof Post>['acl']>().toEqualTypeOf<
		ACL | undefined
	>()
	expectTypeOf<InferUpdateInput<typeof Post>['acl']>().toEqualTypeOf<
		ACL | undefined
	>()

	new Post({ title: 'Hello' })
	new Post({ title: 'Hello', acl: new ACL() })
})

test('preserves explicit data contracts and discriminates shared input resolution', () => {
	type ResolvedData = Readonly<{ title: string; visibility?: string }>

	acl<ResolvedData>({
		default: ({ data, principal, context }) => {
			expectTypeOf(data).toEqualTypeOf<ResolvedData>()
			expectTypeOf(principal).toEqualTypeOf<PointerValue | undefined>()
			expectTypeOf(context.requestId).toBeString()

			return new ACL()
		},
		resolveInput: (input) => {
			if (input.operation === 'create') {
				expectTypeOf(input).toEqualTypeOf<
					ACLCreateInputResolution<ResolvedData>
				>()
				expectTypeOf(input.data).toEqualTypeOf<ResolvedData>()
				expectTypeOf(input.currentData).toEqualTypeOf<undefined>()
				expectTypeOf(input.update).toEqualTypeOf<undefined>()
				// @ts-expect-error -- Callback snapshots are immutable.
				input.data.title = 'mutated'
				return input.inputAcl
			}

			expectTypeOf(input).toEqualTypeOf<
				ACLUpdateInputResolution<ResolvedData>
			>()
			expectTypeOf(input.data).toEqualTypeOf<ResolvedData>()
			expectTypeOf(input.currentData).toEqualTypeOf<ResolvedData>()
			expectTypeOf(input.update.kind).toEqualTypeOf<'update-expression'>()
			expectTypeOf(input.update.operations[0]?.value).toEqualTypeOf<unknown>()
			// @ts-expect-error -- Locked current data cannot be mutated by ACL callbacks.
			input.currentData.title = 'mutated'
			return input.inputAcl ?? input.currentAcl
		},
	})
})

test('contextually infers exact sibling fields without a manual data generic', () => {
	const Author = Schema.define({
		className: 'ContextualACLAuthor',
		fields: { name: stringField({ validation: { required: true } }) },
	})
	const customField = definePluginField(
		'fixture.contextual-acl',
		{ validation: { required: true } },
		{ snapshotValue: (value: unknown): string => String(value) },
	)
	const Post = Schema.define({
		className: 'ContextualACLPost',
		fields: {
			author: pointerField({
				target: () => Author,
				validation: { required: true },
			}),
			custom: customField,
			profile: objectField({
				fields: {
					displayName: stringField({ validation: { required: true } }),
				},
				typeName: 'ContextualACLProfile',
			}),
			tags: stringField({ list: true }),
			title: stringField({ validation: { required: true } }),
			visibility: stringField(),
		},
		extensions: ({ bind }) => [
			bind(acl, {
				default: ({ data }) => {
					expectTypeOf(data.title).toEqualTypeOf<string>()
					expectTypeOf(data.visibility).toEqualTypeOf<string | undefined>()
					expectTypeOf(data.tags).toEqualTypeOf<readonly string[] | undefined>()
					expectTypeOf(data.profile).toEqualTypeOf<
						Readonly<{ displayName: string }> | undefined
					>()
					expectTypeOf(data.author).toEqualTypeOf<Pointer<typeof Author>>()
					expectTypeOf(data.custom).toEqualTypeOf<string>()
					const selectField = <TKey extends keyof typeof data>(
						field: TKey,
					): TKey => field
					// @ts-expect-error -- Framework system fields are not schema-local data.
					selectField('id')
					// @ts-expect-error -- Extension-contributed fields cannot couple sibling extensions.
					selectField('acl')
					// @ts-expect-error -- Undeclared sibling fields are rejected.
					selectField('unknown')

					return new ACL()
				},
				resolveInput: (input) => {
					expectTypeOf(input.data.title).toEqualTypeOf<string>()

					if (input.operation === 'update') {
						expectTypeOf(input.currentData.visibility).toEqualTypeOf<
							string | undefined
						>()
					}

					return input.inputAcl ?? input.currentAcl
				},
			}),
		],
	})

	expectTypeOf(Post.fields.acl.kind).toEqualTypeOf<'ultimabase.acl'>()
})

test('rejects incompatible public configuration types', () => {
	// @ts-expect-error -- Static defaults must be immutable ACL values.
	acl({ default: { public: ['read'] } })
	// @ts-expect-error -- Input resolution must return an ACL or undefined.
	acl({ resolveInput: () => true })
	// @ts-expect-error -- Schema limits accept only documented keys.
	acl({ limits: { maximum: 10 } })
})
