import { Schema, type Pointer } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	PasswordUser,
	PasswordUserSchema,
	passwordAuthPlugin,
	type PasswordAuthPlugin,
	type PasswordPrincipal,
	type PasswordUserDefinition,
	type PasswordAuthenticationResult,
	type PasswordLogoutResult,
} from './index.js'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
	indexes: [{ fields: ['displayName', 'username'] }],
})

test('types class authentication results against the exact User and rejects extra options', () => {
	const credentials = {
		username: 'Ada',
		password: 'correct horse battery staple',
	}
	expectTypeOf(AppUser.signUp(credentials)).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof AppUser>>
	>()
	expectTypeOf(AppUser.login(credentials)).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof AppUser>>
	>()
	expectTypeOf(AppUser.refresh('token')).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof AppUser>>
	>()
	expectTypeOf(AppUser.logout('token')).toEqualTypeOf<
		Promise<PasswordLogoutResult>
	>()
	expectTypeOf(PasswordUser.signUp(credentials)).toEqualTypeOf<
		Promise<PasswordAuthenticationResult<typeof PasswordUser>>
	>()
	// @ts-expect-error -- Credentials require both username and password.
	void AppUser.signUp({ username: 'Ada' })
	// @ts-expect-error -- Session objects cannot replace the exact raw token.
	void AppUser.refresh({ token: 'token' })
	// @ts-expect-error -- Authentication does not introduce a caller elevation option.
	void AppUser.login(credentials, { useMasterKey: true })
	// @ts-expect-error -- The token is explicit even inside an authenticated request.
	void AppUser.logout()
})

test('retains nominal User and principal typing', () => {
	expectTypeOf(AppUser).toExtend<PasswordUserDefinition>()
	expectTypeOf(PasswordUser).toExtend<PasswordUserDefinition>()
	expectTypeOf(
		passwordAuthPlugin({ user: AppUser }),
	).toEqualTypeOf<PasswordAuthPlugin>()
	expectTypeOf<PasswordPrincipal<typeof AppUser>['user']>().toEqualTypeOf<
		Pointer<typeof AppUser>
	>()
})

test('rejects arbitrary schemas and reserved custom fields', () => {
	const ForeignUser = Schema.define({ className: 'User', fields: () => ({}) })
	passwordAuthPlugin({
		// @ts-expect-error -- Password Auth accepts only its exact final composition point.
		user: ForeignUser,
	})

	// @ts-expect-error -- The canonical identity field belongs to Password Auth.
	PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ username: field.string() }),
	})
	// @ts-expect-error -- Password material cannot become ordinary User data.
	PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ password: field.string() }),
	})
})

test('keeps password configuration exact and bounded at runtime', () => {
	passwordAuthPlugin({
		password: {
			memoryCostKiB: 65_536,
			parallelism: 4,
			policyVersion: 2,
			timeCost: 3,
		},
	})
	passwordAuthPlugin({
		password: {
			// @ts-expect-error -- Argon2id is the fixed v1 algorithm.
			algorithm: 'scrypt',
		},
	})
})
