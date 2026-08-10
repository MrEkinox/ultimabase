import { type PointerValue } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	acl,
	type ACLCreateInputResolution,
	type ACLSchemaExtension,
	type ACLUpdateInputResolution,
} from './acl-extension.js'
import { ACL } from './acl.js'

test('preserves explicit ACL data contracts and input resolution branches', () => {
	type ResolvedData = Readonly<{ title: string; visibility?: string }>
	const extension = acl<ResolvedData>({
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
				expectTypeOf(input.currentData).toEqualTypeOf<undefined>()
				expectTypeOf(input.update).toEqualTypeOf<undefined>()
				return input.inputAcl
			}

			expectTypeOf(input).toEqualTypeOf<
				ACLUpdateInputResolution<ResolvedData>
			>()
			expectTypeOf(input.currentData).toEqualTypeOf<ResolvedData>()
			expectTypeOf(input.update.kind).toEqualTypeOf<'update-expression'>()
			return input.inputAcl ?? input.currentAcl
		},
	})

	expectTypeOf(extension.name).toEqualTypeOf<ACLSchemaExtension['name']>()
	expectTypeOf(extension.scope).toEqualTypeOf<ACLSchemaExtension['scope']>()
})

test('rejects incompatible public ACL configuration', () => {
	// @ts-expect-error -- Static defaults must be immutable ACL values.
	acl({ default: { public: ['read'] } })
	// @ts-expect-error -- Input resolution must return an ACL or undefined.
	acl({ resolveInput: () => true })
	// @ts-expect-error -- Schema limits accept only documented keys.
	acl({ limits: { maximum: 10 } })
})
