import { type PointerValue, Schema } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import type { ACLSchemaOption } from './acl-option.js'
import { ACL } from './acl.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly acl?: ACLSchemaOption<this>
	}
}

test('infers exact sibling data for direct ACL callbacks', () => {
	const Post = Schema.define({
		className: 'DirectACLTypePost',
		fields: (field) => ({
			title: field.string({ validation: { required: true } }),
			visibility: field.string(),
		}),
		acl: {
			default: ({ data, principal, context }) => {
				expectTypeOf(data.title).toBeString()
				expectTypeOf(data.visibility).toEqualTypeOf<string | null>()
				expectTypeOf(principal).toEqualTypeOf<PointerValue | undefined>()
				expectTypeOf(context.requestId).toBeString()
				return new ACL()
			},
			resolveInput: (input) => {
				expectTypeOf(input.data.title).toBeString()
				if (input.operation === 'create') {
					expectTypeOf(input.currentData).toEqualTypeOf<undefined>()
					expectTypeOf(input.update).toEqualTypeOf<undefined>()
					return input.inputAcl
				}

				expectTypeOf(input.currentData.title).toBeString()
				expectTypeOf(input.update.kind).toEqualTypeOf<'update-expression'>()
				return input.inputAcl ?? input.currentAcl
			},
		},
	})

	void Post
})

test('rejects incompatible public ACL configuration', () => {
	Schema.define({
		className: 'InvalidDirectACLTypePost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Static defaults must be immutable ACL values.
		acl: { default: { public: ['read'] } },
	})
	Schema.define({
		className: 'InvalidDirectACLResolverPost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Input resolution must return an ACL or undefined.
		acl: { resolveInput: () => true },
	})
	Schema.define({
		className: 'InvalidDirectACLLimitsPost',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Schema limits accept only documented keys.
		acl: { limits: { maximum: 10 } },
	})
})
