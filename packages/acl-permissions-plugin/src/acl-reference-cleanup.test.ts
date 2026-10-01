import { RequestSubjectReference, UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'
import {
	createACLReferenceRowFilter,
	removeACLReference,
} from './acl-reference-cleanup.js'

const Principal = UltimaBase.Schema.define({
	className: 'ACLReferenceCleanupPrincipal',
	fields: () => ({}),
})
const alice = Principal.pointer('alice')
const bob = Principal.pointer('bob')
const editor = new RequestSubjectReference('role', 'role-editor')
const reviewer = new RequestSubjectReference('role', 'role-reviewer')
const complete = new ACL()
	.grantPublic('read')
	.grantAuthenticated('read')
	.grantPrincipal(alice, 'read', 'update')
	.grantPrincipal(bob, 'delete')
	.grantRole(editor, 'read', 'update')
	.grantRole(reviewer, 'delete')

describe('ACL reference cleanup', () => {
	it('removes one principal while preserving every unrelated grant', () => {
		const cleaned = removeACLReference(complete, {
			className: Principal.className,
			id: alice.id,
			kind: 'principal',
		})

		expect(cleaned.permissionsForPrincipal(alice)).toStrictEqual([])
		expect(cleaned.permissionsForPrincipal(bob)).toStrictEqual(['delete'])
		expect(cleaned.permissionsForPublic()).toStrictEqual(['read'])
		expect(cleaned.permissionsForAuthenticated()).toStrictEqual(['read'])
		expect(cleaned.permissionsForRole(editor)).toStrictEqual(['read', 'update'])
		expect(complete.permissionsForPrincipal(alice)).toStrictEqual([
			'read',
			'update',
		])
	})

	it('removes one role while preserving principals and sibling roles', () => {
		const cleaned = removeACLReference(complete, {
			kind: 'role',
			value: editor.value,
		})

		expect(cleaned.permissionsForRole(editor)).toStrictEqual([])
		expect(cleaned.permissionsForRole(reviewer)).toStrictEqual(['delete'])
		expect(cleaned.permissionsForPrincipal(alice)).toStrictEqual([
			'read',
			'update',
		])
	})

	it('creates detached principal and role lookup row filters', () => {
		const principal = createACLReferenceRowFilter({
			className: Principal.className,
			id: alice.id,
			kind: 'principal',
		})
		const role = createACLReferenceRowFilter({
			kind: 'role',
			value: editor.value,
		})

		expect(principal).toStrictEqual({
			field: 'acl',
			kind: 'contains',
			value: {
				principals: [{ className: Principal.className, id: alice.id }],
			},
		})
		expect(role).toStrictEqual({
			field: 'acl',
			kind: 'contains',
			value: { roles: [{ kind: 'role', value: editor.value }] },
		})
		expect(Object.isFrozen(principal)).toBe(true)
	})
})
