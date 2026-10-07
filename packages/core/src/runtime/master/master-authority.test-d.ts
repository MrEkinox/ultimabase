import { expectTypeOf, test } from 'vitest'

import {
	MasterAuthority,
	type MasterAccessEvent,
	type MasterKeyGrant,
} from './master-authority.js'

test('types opaque grants and audit events without exposing raw credentials', () => {
	const authority = new MasterAuthority({
		keys: [{ id: 'typed', value: 'typed-secret' }],
		onUse: (event) => {
			expectTypeOf(event).toEqualTypeOf<MasterAccessEvent>()
			expectTypeOf(event.keyId).toBeString()
			expectTypeOf(event).not.toHaveProperty('key')
		},
	})
	const grant = authority.authorize('typed-secret')

	expectTypeOf(grant).toEqualTypeOf<MasterKeyGrant>()
	expectTypeOf(authority).not.toHaveProperty('elevate')

	// @ts-expect-error -- Only MasterAuthority can construct an opaque grant.
	new MasterKeyGrant('typed')
})
