import {
	Schema,
	stringField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
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
				return input.inputAcl
			}

			expectTypeOf(input).toEqualTypeOf<
				ACLUpdateInputResolution<ResolvedData>
			>()
			return input.inputAcl ?? input.currentAcl
		},
	})
})

test('rejects incompatible public configuration types', () => {
	// @ts-expect-error -- Static defaults must be immutable ACL values.
	acl({ default: { public: ['read'] } })
	// @ts-expect-error -- Input resolution must return an ACL or undefined.
	acl({ resolveInput: () => true })
	// @ts-expect-error -- Schema limits accept only documented keys.
	acl({ limits: { maximum: 10 } })
})
