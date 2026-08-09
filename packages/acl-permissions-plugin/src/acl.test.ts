import {
	AccessSubjectReference,
	Schema,
	type AccessRoleReferenceCarrier,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'
import { aclPermissions } from './acl-contracts.js'

const User = Schema.define({ className: 'ACLUser', fields: () => ({}) })
const ServiceAccount = Schema.define({
	className: 'ACLServiceAccount',
	fields: () => ({}),
})
const alice = User.pointer('shared-id')
const service = ServiceAccount.pointer('shared-id')
const editor = new AccessSubjectReference('role', 'role:editor')
const moderator = new AccessSubjectReference('role', 'role:moderator')

describe('ACL', () => {
	it('starts empty and exposes one canonical permission vocabulary', () => {
		const acl = new ACL()

		expect(aclPermissions).toStrictEqual(['read', 'update', 'delete'])
		expect(acl.permissionsForPublic()).toStrictEqual([])
		expect(acl.permissionsForAuthenticated()).toStrictEqual([])
		expect(acl.permissionsForPrincipal(alice)).toStrictEqual([])
		expect(acl.permissionsForRole(editor)).toStrictEqual([])
		expect(Object.keys(acl)).toStrictEqual([])
		expect(Object.isFrozen(acl)).toBe(true)
	})

	it('branches public and authenticated rights without mutating ancestors', () => {
		const empty = new ACL()
		const readable = empty.grantPublic('read')
		const authenticated = readable.grantAuthenticated('update', 'read')
		const restricted = authenticated.revokeAuthenticated('read')

		expect(empty.permissionsForPublic()).toStrictEqual([])
		expect(readable.permissionsForPublic()).toStrictEqual(['read'])
		expect(authenticated.permissionsForAuthenticated()).toStrictEqual([
			'read',
			'update',
		])
		expect(restricted.permissionsForAuthenticated()).toStrictEqual(['update'])
		expect(restricted.hasAuthenticatedPermission('update')).toBe(true)
		expect(restricted.hasAuthenticatedPermission('read')).toBe(false)
		expect(readable).not.toBe(empty)
		expect(empty.grantPublic()).not.toBe(empty)
	})

	it('keeps multiple schema-qualified principals with equal IDs distinct', () => {
		const acl = new ACL()
			.grantPrincipal(alice, 'update', 'read')
			.grantPrincipal(service, 'delete')
			.grantPrincipal(alice, 'delete', 'read')

		expect(acl.permissionsForPrincipal(alice)).toStrictEqual([
			'read',
			'update',
			'delete',
		])
		expect(acl.permissionsForPrincipal(service)).toStrictEqual(['delete'])
		expect(acl.hasPrincipalPermission(service, 'delete')).toBe(true)
	})

	it('revokes and replaces only one principal entry', () => {
		const original = new ACL()
			.grantPrincipal(alice, 'read', 'update')
			.grantPrincipal(service, 'read')
		const revoked = original.revokePrincipal(alice, 'read')
		const replaced = revoked.setPrincipalPermissions(alice, 'delete')
		const removed = replaced.setPrincipalPermissions(alice)

		expect(original.permissionsForPrincipal(alice)).toStrictEqual([
			'read',
			'update',
		])
		expect(revoked.permissionsForPrincipal(alice)).toStrictEqual(['update'])
		expect(replaced.permissionsForPrincipal(alice)).toStrictEqual(['delete'])
		expect(removed.permissionsForPrincipal(alice)).toStrictEqual([])
		expect(removed.permissionsForPrincipal(service)).toStrictEqual(['read'])
	})

	it('supports multiple roles and persisted-value reference carriers', () => {
		const persistedEditor: AccessRoleReferenceCarrier = {
			toAccessRoleReference: () => editor,
		}
		const acl = new ACL()
			.grantRole(persistedEditor, 'update', 'read')
			.grantRole(moderator, 'delete')
			.grantRole(editor, 'delete')

		expect(acl.permissionsForRole(editor)).toStrictEqual([
			'read',
			'update',
			'delete',
		])
		expect(acl.permissionsForRole(persistedEditor)).toStrictEqual([
			'read',
			'update',
			'delete',
		])
		expect(acl.permissionsForRole(moderator)).toStrictEqual(['delete'])
		expect(acl.hasRolePermission(persistedEditor, 'update')).toBe(true)
	})

	it('revokes and replaces only one role entry', () => {
		const original = new ACL()
			.grantRole(editor, 'read', 'update')
			.grantRole(moderator, 'read')
		const revoked = original.revokeRole(editor, 'read')
		const replaced = revoked.setRolePermissions(editor, 'delete')
		const removed = replaced.setRolePermissions(editor)

		expect(original.permissionsForRole(editor)).toStrictEqual([
			'read',
			'update',
		])
		expect(revoked.permissionsForRole(editor)).toStrictEqual(['update'])
		expect(replaced.permissionsForRole(editor)).toStrictEqual(['delete'])
		expect(removed.permissionsForRole(editor)).toStrictEqual([])
		expect(removed.permissionsForRole(moderator)).toStrictEqual(['read'])
	})

	it('replaces public and authenticated rights canonically', () => {
		const acl = new ACL()
			.grantPublic('delete', 'read')
			.setPublicPermissions('update')
			.grantAuthenticated('update', 'read')
			.setAuthenticatedPermissions('delete', 'read')

		expect(acl.permissionsForPublic()).toStrictEqual(['update'])
		expect(acl.permissionsForAuthenticated()).toStrictEqual(['read', 'delete'])
		expect(acl.hasPublicPermission('update')).toBe(true)
	})

	it('keeps repeated grants and revocations deterministic', () => {
		const acl = new ACL()
			.grantPrincipal(alice, 'update', 'read', 'read')
			.grantPrincipal(alice, 'update')
			.revokePrincipal(alice, 'delete')

		expect(acl.permissionsForPrincipal(alice)).toStrictEqual(['read', 'update'])
	})

	it('returns detached frozen permission snapshots', () => {
		const acl = new ACL().grantPublic('read')
		const first = acl.permissionsForPublic()
		const second = acl.permissionsForPublic()

		expect(first).toStrictEqual(['read'])
		expect(first).not.toBe(second)
		expect(Object.isFrozen(first)).toBe(true)
	})

	it('rejects malformed runtime permissions, principals, and role carriers', () => {
		expect(() => new ACL().grantPublic('execute' as never)).toThrow(
			new TypeError('Unknown ACL permission: execute'),
		)
		expect(() =>
			new ACL().grantPrincipal({ id: 'alice' } as never, 'read'),
		).toThrow(new TypeError('ACL principal must be a Pointer'))
		expect(() =>
			new ACL().grantRole(
				{
					toAccessRoleReference: () =>
						new AccessSubjectReference('principal', 'alice') as never,
				},
				'read',
			),
		).toThrow(
			new TypeError(
				'Access role subject must provide one string role reference',
			),
		)
	})

	it('cannot be subclassed', () => {
		class ExtendedACL extends ACL {}

		expect(() => new ExtendedACL()).toThrow(
			new TypeError('ACL cannot be subclassed'),
		)
	})
})
