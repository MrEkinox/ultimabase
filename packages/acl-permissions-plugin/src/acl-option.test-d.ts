import {
	type PluginExports,
	type PointerValue,
	UltimaBase,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import { ACL } from './acl.js'
import { aclPlugin } from './plugin.js'

const Application = UltimaBase.use(aclPlugin())

test('does not expose a redundant application-local setup value', () => {
	expectTypeOf<
		PluginExports<ReturnType<typeof aclPlugin>>
	>().toEqualTypeOf<undefined>()
})

test('keeps ACL callback inputs available before the named graph is generated', () => {
	const Post = Application.Schema.define({
		className: 'DirectACLTypePost',
		fields: (field) => ({
			title: field.string({ required: true }),
			visibility: field.string(),
		}),
		acl: {
			default: ({ data, principal, context }) => {
				// Exact sibling fields are checked against generated declarations in Typegen's editor suite.
				expectTypeOf(data.title).toEqualTypeOf<unknown>()
				expectTypeOf(principal).toEqualTypeOf<PointerValue | undefined>()
				expectTypeOf(context.requestId).toBeString()
				return new ACL()
			},
			resolveInput: (input) => {
				expectTypeOf(input.data.title).toEqualTypeOf<unknown>()
				if (input.operation === 'create') {
					expectTypeOf(input.currentData).toEqualTypeOf<undefined>()
					expectTypeOf(input.update).toEqualTypeOf<undefined>()
					return input.inputAcl
				}

				expectTypeOf(input.currentData.title).toEqualTypeOf<unknown>()
				expectTypeOf(input.update.kind).toEqualTypeOf<'update-expression'>()
				return input.inputAcl ?? input.currentAcl
			},
		},
	})

	void Post
})

test('rejects incompatible public ACL configuration', () => {
	Application.Schema.define({
		className: 'InvalidDirectACLTypePost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Static defaults must be immutable ACL values.
		acl: { default: { public: ['read'] } },
	})
	Application.Schema.define({
		className: 'InvalidDirectACLResolverPost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Input resolution must return an ACL or undefined.
		acl: { resolveInput: () => true },
	})
	Application.Schema.define({
		className: 'InvalidDirectACLLimitsPost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Schema limits accept only documented keys.
		acl: { limits: { maximum: 10 } },
	})
})
