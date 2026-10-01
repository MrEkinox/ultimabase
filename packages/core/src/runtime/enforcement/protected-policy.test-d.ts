import { expectTypeOf, test } from 'vitest'

import type { ProtectedPolicyDefinition } from './protected-policy.js'
import { protectedPolicy } from './protected-policy.js'
import { UltimaBase } from '../application/ultima-base.js'

const Post = UltimaBase.Schema.define({
	className: 'TypedProtectedPolicyPost',
	fields: (field) => ({ title: field.string() }),
})

test('preserves exact protected policy schema and operation matching types', () => {
	const policy = protectedPolicy({
		evaluate: () => ({ selectionFields: ['title'] }),
		operations: ['find-many'] as const,
		schema: Post,
	})

	expectTypeOf(policy).toEqualTypeOf<
		ProtectedPolicyDefinition<typeof Post, 'find-many'>
	>()
})
