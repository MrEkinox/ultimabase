import { expectTypeOf, test } from 'vitest'

import { RequestContext } from '../context/request-context.js'
import {
	MasterAuthority,
	type MasterAccessEvent,
	type MasterKeyGrant,
} from './master-authority.js'

test('types opaque grants and audit events without exposing raw credentials', async () => {
	const authority = new MasterAuthority({
		keys: [{ id: 'typed', value: 'typed-secret' }],
		onUse: (event) => {
			expectTypeOf(event).toEqualTypeOf<MasterAccessEvent>()
			expectTypeOf(event.keyId).toBeString()
			expectTypeOf(event).not.toHaveProperty('key')
		},
	})
	const context = RequestContext.anonymous({
		requestId: 'typed-master',
		source: 'job',
	})
	const grant = authority.authorize('typed-secret')
	const master = await authority.elevate(grant, context, 'typed maintenance')

	expectTypeOf(grant).toEqualTypeOf<MasterKeyGrant>()
	expectTypeOf(master.access.mode).toEqualTypeOf<'master'>()
	expectTypeOf(master.source).toEqualTypeOf<'job'>()

	// @ts-expect-error -- Only MasterAuthority can construct an opaque grant.
	new MasterKeyGrant('typed')
})
