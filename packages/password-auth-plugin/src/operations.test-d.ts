import {
	FrameworkApplication,
	type PluginOperationInput,
	type PluginOperationResult,
	type SchemaResult,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	passwordAuthPlugin,
	PasswordUserSchema,
	type PasswordAuthHttpOptions,
	type PasswordCredentialsInput,
	type PasswordSignUpInput,
} from './index.js'
import type { passwordAuthOperations } from './index.js'
import type {
	PasswordAuthenticationResult,
	PasswordLogoutResult,
} from './session.js'

test('retains exact operation input and result contracts', () => {
	expectTypeOf<
		PluginOperationInput<typeof passwordAuthOperations.login>
	>().toEqualTypeOf<PasswordCredentialsInput>()
	expectTypeOf<
		PluginOperationInput<typeof passwordAuthOperations.signUp>
	>().toEqualTypeOf<PasswordSignUpInput>()
	expectTypeOf<
		PluginOperationResult<typeof passwordAuthOperations.login>
	>().toEqualTypeOf<PasswordAuthenticationResult>()
	expectTypeOf<
		PluginOperationInput<typeof passwordAuthOperations.refresh>
	>().toEqualTypeOf<null>()
	expectTypeOf<
		PluginOperationResult<typeof passwordAuthOperations.logout>
	>().toEqualTypeOf<PasswordLogoutResult>()
})

test('types the required profile through the configured User schema contract', () => {
	const User = PasswordUserSchema.define({
		className: 'User',
		fields: (field) => ({ displayName: field.string() }),
	})
	expectTypeOf(User.className).toEqualTypeOf<'User'>()
	expectTypeOf<
		PasswordAuthenticationResult<typeof User>['user']
	>().toEqualTypeOf<SchemaResult<typeof User>>()
	expectTypeOf<
		PluginOperationResult<typeof passwordAuthOperations.refresh>['user']
	>().toEqualTypeOf<PasswordAuthenticationResult['user']>()
})

test('exposes one typed application-bound runWithSession helper', async () => {
	const application = new FrameworkApplication({
		plugins: [passwordAuthPlugin()],
		schemas: [],
	})
	const auth = application.getPlugin('@ultimabase/password-auth-plugin')
	const result = auth.runWithSession('token', () => 42 as const)
	expectTypeOf(result).toEqualTypeOf<Promise<42>>()
	// @ts-expect-error -- the helper accepts only raw strings at its credential edge.
	void auth.runWithSession(42, () => undefined)
	await Promise.resolve()
})

test('types the explicit secure-cookie HTTP option', () => {
	const http = {
		cookie: { name: '__Host-session', sameSite: 'strict' },
	} as const satisfies PasswordAuthHttpOptions
	passwordAuthPlugin({ http })
	passwordAuthPlugin({
		http: {
			cookie: {
				name: '__Host-session',
				// @ts-expect-error -- only the three supported SameSite modes compile.
				sameSite: 'invalid',
			},
		},
	})
})
