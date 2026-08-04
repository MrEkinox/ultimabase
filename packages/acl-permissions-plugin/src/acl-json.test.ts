import { AccessSubjectReference, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'

const User = Schema.define({ className: 'ACLJSONUser', fields: {} })
const Service = Schema.define({ className: 'ACLJSONService', fields: {} })
const user = User.pointer('shared-id')
const service = Service.pointer('shared-id')
const editor = new AccessSubjectReference('role', 'role:editor')
const reviewer = new AccessSubjectReference('role', 'role:reviewer')

describe('ACL JSON', () => {
	it('round-trips every subject without schema or provider lookup', () => {
		const original = new ACL()
			.grantPublic('read')
			.grantAuthenticated('update')
			.grantPrincipal(user, 'read', 'update')
			.grantPrincipal(service, 'delete')
			.grantRole(editor, 'read', 'update')
			.grantRole(reviewer, 'delete')
		const document = original.toJSON()
		const restored = ACL.fromJSON(document)

		expect(restored.toJSON()).toStrictEqual(document)
		expect(restored.permissionsForPrincipal(user)).toStrictEqual([
			'read',
			'update',
		])
		expect(restored.permissionsForPrincipal(service)).toStrictEqual(['delete'])
		expect(restored.permissionsForRole(editor)).toStrictEqual([
			'read',
			'update',
		])
	})

	it('serializes equivalent call orders to one canonical document', () => {
		const first = new ACL()
			.grantRole(reviewer, 'delete')
			.grantPrincipal(service, 'update')
			.grantPublic('delete', 'read')
			.grantRole(editor, 'update', 'read')
			.grantPrincipal(user, 'read')
		const second = new ACL()
			.grantPrincipal(user, 'read')
			.grantRole(editor, 'read', 'update')
			.grantPublic('read', 'delete')
			.grantPrincipal(service, 'update')
			.grantRole(reviewer, 'delete')

		expect(first.toJSON()).toStrictEqual(second.toJSON())
		expect(JSON.stringify(first)).toBe(JSON.stringify(first.toJSON()))
	})

	it('returns a detached deeply frozen snapshot', () => {
		const acl = new ACL()
			.grantPrincipal(user, 'read')
			.grantRole(editor, 'update')
		const first = acl.toJSON()
		const second = acl.toJSON()

		expect(first).not.toBe(second)
		expect(first.principals).not.toBe(second.principals)
		expect(first.principals[0]).not.toBe(second.principals[0])
		expect(Object.isFrozen(first)).toBe(true)
		expect(Object.isFrozen(first.public)).toBe(true)
		expect(Object.isFrozen(first.principals)).toBe(true)
		expect(Object.isFrozen(first.principals[0])).toBe(true)
		expect(Object.isFrozen(first.principals[0]?.permissions)).toBe(true)
		expect(Object.isFrozen(first.roles[0])).toBe(true)
		expect(Object.isFrozen(first.roles[0]?.permissions)).toBe(true)
	})

	it('unions duplicate rights and entries during canonical parsing', () => {
		const acl = ACL.fromJSON({
			version: 1,
			public: ['delete', 'read', 'read'],
			authenticated: [],
			principals: [
				{ className: 'ACLJSONUser', id: 'shared-id', permissions: ['update'] },
				{
					className: 'ACLJSONUser',
					id: 'shared-id',
					permissions: ['read', 'update'],
				},
			],
			roles: [
				{ kind: 'role', value: 'role:editor', permissions: ['update'] },
				{
					kind: 'role',
					value: 'role:editor',
					permissions: ['read', 'update'],
				},
			],
		})

		expect(acl.toJSON()).toStrictEqual({
			version: 1,
			public: ['read', 'delete'],
			authenticated: [],
			principals: [
				{
					className: 'ACLJSONUser',
					id: 'shared-id',
					permissions: ['read', 'update'],
				},
			],
			roles: [
				{
					kind: 'role',
					value: 'role:editor',
					permissions: ['read', 'update'],
				},
			],
		})
	})

	it.each([
		['a non-object root', null],
		[
			'a missing root key',
			{ version: 1, public: [], authenticated: [], principals: [] },
		],
		[
			'an unknown root key',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [],
				roles: [],
				owner: 'alice',
			},
		],
		[
			'an unknown version',
			{ version: 2, public: [], authenticated: [], principals: [], roles: [] },
		],
		[
			'an unknown right',
			{
				version: 1,
				public: ['execute'],
				authenticated: [],
				principals: [],
				roles: [],
			},
		],
		[
			'an empty principal identity',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [{ className: '', id: 'user', permissions: ['read'] }],
				roles: [],
			},
		],
		[
			'an unknown principal key',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [
					{
						className: 'User',
						id: 'user',
						permissions: ['read'],
						provider: 'auth',
					},
				],
				roles: [],
			},
		],
		[
			'an empty entry permission list',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [{ className: 'User', id: 'user', permissions: [] }],
				roles: [],
			},
		],
		[
			'an unknown role kind',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [],
				roles: [{ kind: 'principal', value: 'user', permissions: ['read'] }],
			},
		],
		[
			'an empty role identity',
			{
				version: 1,
				public: [],
				authenticated: [],
				principals: [],
				roles: [{ kind: 'role', value: '', permissions: ['read'] }],
			},
		],
	] satisfies readonly (readonly [string, unknown])[])(
		'rejects %s',
		(_label, value) => {
			expect(() => ACL.fromJSON(value)).toThrow(TypeError)
		},
	)
})
