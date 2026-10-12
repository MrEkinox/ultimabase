import { describe, expect, it } from 'vitest'

import { password } from './password.js'

describe('password()', () => {
	it('defaults to the username identifier and names the method', () => {
		expect(password()).toStrictEqual({ kind: 'auth-method', name: 'password' })
		expect(Object.isFrozen(password({ identifier: 'email' }))).toBe(true)
	})

	it('rejects unknown options, identifiers and weak policies', () => {
		expect(() => password({ hash: true } as never)).toThrow(
			'password contains unknown option: hash',
		)
		expect(() => password({ identifier: 'phone' } as never)).toThrow(
			"password identifier must be 'username' or 'email'",
		)
		expect(() => password({ policy: { timeCost: 1 } })).toThrow('timeCost')
	})
})
