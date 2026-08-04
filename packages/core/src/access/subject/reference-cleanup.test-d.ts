import { expectTypeOf, test } from 'vitest'

import type { AccessSubjectReference } from './contracts.js'
import { defineAccessReferenceCleanup } from './reference-cleanup.js'

test('preserves the exact neutral subject kind in cleanup callbacks', () => {
	const cleanup = defineAccessReferenceCleanup({
		kind: 'role',
		hasReferences: ({ context, reference }) => {
			expectTypeOf(context.access.mode).toEqualTypeOf<'anonymous' | 'master'>()
			expectTypeOf(reference.kind).toEqualTypeOf<'role'>()

			return false
		},
		cleanup: ({ reference }) => {
			expectTypeOf(reference).toEqualTypeOf<
				AccessSubjectReference<'role', string | number>
			>()
		},
	})

	expectTypeOf(cleanup.kind).toEqualTypeOf<'role'>()
})
