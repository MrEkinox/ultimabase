import { expectTypeOf, test } from 'vitest'

import { RequestCapability } from './capability.js'

test('preserves capability names and rejects structural token forgery', () => {
	const capability = new RequestCapability('tenant:write')

	expectTypeOf(capability.name).toEqualTypeOf<'tenant:write'>()

	// @ts-expect-error -- A matching public shape does not reproduce token identity.
	const forged: RequestCapability<'tenant:write'> = { name: 'tenant:write' }

	expectTypeOf(forged).toBeObject()
})
