import { describe, expect, it } from 'vitest'

import * as publicApi from './index.js'

describe('@ultimabase/password-auth-plugin public entry point', () => {
	it('exports only the implemented identity surface', () => {
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'PasswordUser',
			'PasswordUserSchema',
			'defaultPasswordHashPolicy',
			'defaultPasswordSessionPolicy',
			'passwordAuthErrorCodes',
			'passwordAuthOperationList',
			'passwordAuthOperations',
			'passwordAuthPlugin',
			'passwordPrincipal',
			'passwordSession',
		])
	})
})
