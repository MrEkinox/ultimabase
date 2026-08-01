import { describe, expect, it } from 'vitest'

import {
	accessModes,
	defaultMasterBypassPolicy,
	shouldBypassAccessBoundary,
} from './access.js'

describe('request access modes', () => {
	it('exposes only the immutable anonymous, user, and master set', () => {
		expect(accessModes).toStrictEqual(['anonymous', 'user', 'master'])
		expect(Object.isFrozen(accessModes)).toBe(true)
	})

	it('limits master bypass to class, object, and field permissions', () => {
		const master = {
			keyId: 'maintenance',
			mode: 'master',
			reason: 'repair records',
		} as const

		expect(defaultMasterBypassPolicy).toStrictEqual({
			acl: true,
			'business-hooks': false,
			clp: true,
			'field-permissions': true,
			'sql-constraints': false,
			'structural-validation': false,
			'tenant-isolation': false,
			transactions: false,
		})
		expect(Object.isFrozen(defaultMasterBypassPolicy)).toBe(true)
		expect(shouldBypassAccessBoundary(master, 'clp')).toBe(true)
		expect(shouldBypassAccessBoundary(master, 'acl')).toBe(true)
		expect(shouldBypassAccessBoundary(master, 'field-permissions')).toBe(true)
		expect(shouldBypassAccessBoundary(master, 'structural-validation')).toBe(
			false,
		)
		expect(shouldBypassAccessBoundary({ mode: 'anonymous' }, 'clp')).toBe(false)
	})
})
