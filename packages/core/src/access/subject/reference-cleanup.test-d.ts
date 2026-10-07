import { expectTypeOf, test } from 'vitest'

import type { RequestSubjectReference } from './contracts.js'
import { defineRequestSubjectReferenceCleanup } from './reference-cleanup.js'

test('preserves the exact neutral subject kind in cleanup callbacks', () => {
	const cleanup = defineRequestSubjectReferenceCleanup({
		kind: 'role',
		hasReferences: ({ context, reference }) => {
			expectTypeOf(context.access.mode).toEqualTypeOf<'anonymous' | 'master'>()
			expectTypeOf(reference.kind).toEqualTypeOf<'role'>()

			return false
		},
		cleanup: ({ reference }) => {
			expectTypeOf(reference).toEqualTypeOf<
				RequestSubjectReference<'role', string | number>
			>()
		},
	})

	expectTypeOf(cleanup.kind).toEqualTypeOf<'role'>()
})
