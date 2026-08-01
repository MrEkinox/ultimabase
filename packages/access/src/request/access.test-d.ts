import { expectTypeOf, test } from 'vitest'

import type {
	accessModes,
	AccessMode,
	AnonymousRequestAccess,
	MasterRequestAccess,
	RequestAccess,
	UserRequestAccess,
} from './access.js'

test('keeps access modes closed and their authentication data correlated', () => {
	const anonymous = { mode: 'anonymous' } satisfies AnonymousRequestAccess
	const user = {
		mode: 'user',
		userId: 'user-1',
	} satisfies UserRequestAccess<'user-1'>
	const master = {
		keyId: 'maintenance',
		mode: 'master',
		reason: 'repair tenant data',
	} satisfies MasterRequestAccess

	expectTypeOf<(typeof accessModes)[number]>().toEqualTypeOf<AccessMode>()
	expectTypeOf<RequestAccess>().toEqualTypeOf<
		AnonymousRequestAccess | UserRequestAccess | MasterRequestAccess
	>()
	expectTypeOf(anonymous).not.toHaveProperty('userId')
	expectTypeOf(user.userId).toEqualTypeOf<'user-1'>()
	expectTypeOf(master.reason).toBeString()
	expectTypeOf(master.keyId).toBeString()

	// @ts-expect-error -- There is deliberately no hidden system access mode.
	const systemMode: AccessMode = 'system'
	const forgedAnonymous: AnonymousRequestAccess = {
		mode: 'anonymous',
		// @ts-expect-error -- Anonymous requests cannot carry authenticated user state.
		userId: 'user-1',
	}
	// @ts-expect-error -- User access always carries its authenticated identity.
	const missingUser: UserRequestAccess = { mode: 'user' }

	expectTypeOf(systemMode).toBeString()
	expectTypeOf(forgedAnonymous).toBeObject()
	expectTypeOf(missingUser).toBeObject()
})
