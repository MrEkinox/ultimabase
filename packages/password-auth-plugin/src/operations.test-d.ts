import {
	FrameworkApplication,
	type PluginOperationInput,
	type PluginOperationResult,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	passwordAuthPlugin,
	type PasswordAuthHttpOptions,
	type PasswordCredentialsInput,
} from './index.js'
import type { passwordAuthOperations } from './index.js'
import type {
	PasswordAuthenticationResult,
	PasswordLogoutResult,
} from './session.js'

test('retains exact operation input and result contracts', () => {
	expectTypeOf<
		PluginOperationInput<typeof passwordAuthOperations.signUp>
	>().toEqualTypeOf<PasswordCredentialsInput>()
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
