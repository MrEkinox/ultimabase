import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createPasswordPrincipal, isPasswordPrincipal } from './principal.js'

const User = UltimaBase.Schema.define({
	className: 'PasswordPrincipalUser',
	fields: () => ({}),
})

describe('PasswordPrincipal', () => {
	it('creates one immutable nominal identity containing only a User pointer', () => {
		const pointer = User.pointer('0198c000-0000-7000-8000-000000000001')
		const principal = createPasswordPrincipal(pointer)

		expect(principal).toStrictEqual({ user: pointer })
		expect(Object.isFrozen(principal)).toBe(true)
		expect(isPasswordPrincipal(principal)).toBe(true)
		expect(isPasswordPrincipal({ user: pointer })).toBe(false)
		expect(JSON.stringify(principal)).not.toContain('password')
		expect(JSON.stringify(principal)).not.toContain('credential')
	})

	it('rejects structurally similar non-Pointer values', () => {
		expect(() =>
			createPasswordPrincipal({ id: 'user', schema: User } as never),
		).toThrow('Core Pointer')
	})
})
