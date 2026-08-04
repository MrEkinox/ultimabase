import {
	aclFieldName,
	aclRowConstraintKind,
	aclRowConstraintVersion,
} from '@ultimabase/acl-permissions-plugin'
import { describe, expect, it } from 'vitest'

import {
	aclPostgresConstraintCompiler,
	decodeACLRowConstraintPayload,
} from './acl-constraint.js'

const validPayload = {
	field: aclFieldName,
	permission: 'read',
	principalClassName: 'User',
	principalId: '0198a43e-2431-7000-8000-000000000060',
	roleResolutionAvailable: true,
	roles: ['role-editor', 'role-author'],
} as const

describe('ACL PostgreSQL constraint', () => {
	it('decodes every resolved subject without retaining caller-owned arrays', () => {
		const roles: string[] = [...validPayload.roles]
		const decoded = decodeACLRowConstraintPayload({ ...validPayload, roles })

		roles[0] = 'changed'

		expect(decoded).toStrictEqual(validPayload)
		expect(Object.isFrozen(decoded)).toBe(true)
		expect(Object.isFrozen(decoded.roles)).toBe(true)
		expect(aclPostgresConstraintCompiler).toStrictEqual({
			adapter: 'postgres',
			kind: aclRowConstraintKind,
			version: aclRowConstraintVersion,
		})
	})

	it.each([
		[null, 'payload must be an object'],
		[{ ...validPayload, field: 'permissions' }, 'field must be acl'],
		[{ ...validPayload, permission: 'manage' }, 'permission is invalid'],
		[
			{ ...validPayload, principalId: null },
			'principal id must be a non-empty string',
		],
		[
			{ ...validPayload, roles: ['duplicate', 'duplicate'] },
			'must not contain duplicates',
		],
		[
			{
				...validPayload,
				principalClassName: null,
				principalId: null,
				roleResolutionAvailable: false,
			},
			'require role resolution availability',
		],
		[{ ...validPayload, extra: true }, 'payload has invalid keys'],
	] as const)('rejects malformed payloads', (payload, message) => {
		expect(() => decodeACLRowConstraintPayload(payload)).toThrow(message)
	})

	it('rejects hidden and symbol payload keys', () => {
		const hidden = { ...validPayload }
		const symbolic = { ...validPayload, [Symbol('hidden')]: true }

		Object.defineProperty(hidden, 'hidden', {
			enumerable: false,
			value: true,
		})

		expect(() => decodeACLRowConstraintPayload(hidden)).toThrow(
			'payload has invalid keys',
		)
		expect(() => decodeACLRowConstraintPayload(symbolic)).toThrow(
			'payload has invalid keys',
		)
	})
})
