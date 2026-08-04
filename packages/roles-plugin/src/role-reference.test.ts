import { AccessSubjectReference, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	createRoleReference,
	getRoleReferenceState,
	normalizeRoleName,
} from './role-reference.js'

const RoleFixture = Schema.define({ className: 'ReferenceRole', fields: {} })

describe('role references', () => {
	it('normalizes names with one locale-independent identity strategy', () => {
		expect(normalizeRoleName('  ÉDITOR  ')).toBe('éditor')
		expect(normalizeRoleName('ＥＤＩＴＯＲ')).toBe('editor')
		expect(() => normalizeRoleName('   ')).toThrow(
			new TypeError('role name must not be empty'),
		)
	})

	it('retains schema-qualified name state beside a neutral frozen reference', () => {
		const reference = createRoleReference(RoleFixture, { name: ' Editor ' })

		expect(reference).toBeInstanceOf(AccessSubjectReference)
		expect(reference.kind).toBe('role')
		expect(Object.isFrozen(reference)).toBe(true)
		expect(getRoleReferenceState(reference)).toStrictEqual({
			schema: RoleFixture,
			selector: { name: 'editor' },
		})
	})

	it('requires explicit valid UUID selectors', () => {
		const id = '123e4567-e89b-42d3-a456-426614174000'
		const reference = createRoleReference(RoleFixture, { id })

		expect(getRoleReferenceState(reference)?.selector).toStrictEqual({ id })
		expect(() => createRoleReference(RoleFixture, { id: 'editor' })).toThrow(
			new TypeError('role id must be a UUID'),
		)
	})
})
