import { expectTypeOf, test } from 'vitest'

import type {
	accessModes,
	AccessMode,
	AnonymousRequestAccess,
	MasterRequestAccess,
	RequestAccess,
} from './access.js'

test('keeps foundational authority closed without authentication data', () => {
	const anonymous = { mode: 'anonymous' } satisfies AnonymousRequestAccess
	const master = {
		keyId: 'maintenance',
		mode: 'master',
		reason: 'repair tenant data',
	} satisfies MasterRequestAccess

	expectTypeOf<(typeof accessModes)[number]>().toEqualTypeOf<AccessMode>()
	expectTypeOf<RequestAccess>().toEqualTypeOf<
		AnonymousRequestAccess | MasterRequestAccess
	>()
	expectTypeOf(anonymous).not.toHaveProperty('userId')
	expectTypeOf(master.reason).toBeString()
	expectTypeOf(master.keyId).toBeString()

	// @ts-expect-error -- There is deliberately no hidden system access mode.
	const systemMode: AccessMode = 'system'
	const forgedAnonymous: AnonymousRequestAccess = {
		mode: 'anonymous',
		// @ts-expect-error -- Anonymous requests cannot carry authenticated user state.
		userId: 'user-1',
	}
	// @ts-expect-error -- Authentication is not a foundational authority mode.
	const userMode: AccessMode = 'user'

	expectTypeOf(systemMode).toBeString()
	expectTypeOf(forgedAnonymous).toBeObject()
	expectTypeOf(userMode).toBeString()
})
