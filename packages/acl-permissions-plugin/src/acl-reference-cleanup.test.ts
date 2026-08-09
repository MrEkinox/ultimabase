import { AccessSubjectReference, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'
import {
	aclReferenceConstraintKind,
	aclReferenceConstraintVersion,
	createACLReferenceConstraint,
	removeACLReference,
} from './acl-reference-cleanup.js'

const Principal = Schema.define({
	className: 'ACLReferenceCleanupPrincipal',
	fields: () => ({}),
})
const alice = Principal.pointer('alice')
const bob = Principal.pointer('bob')
const editor = new AccessSubjectReference('role', 'role-editor')
const reviewer = new AccessSubjectReference('role', 'role-reviewer')
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

	it('creates detached principal and role lookup constraints', () => {
		const principal = createACLReferenceConstraint({
			className: Principal.className,
			id: alice.id,
			kind: 'principal',
		})
		const role = createACLReferenceConstraint({
			kind: 'role',
			value: editor.value,
		})

		expect(principal).toStrictEqual({
			kind: aclReferenceConstraintKind,
			payload: {
				field: 'acl',
				principalClassName: Principal.className,
				principalId: alice.id,
				role: null,
				subjectKind: 'principal',
			},
			version: aclReferenceConstraintVersion,
		})
		expect(role).toStrictEqual({
			kind: aclReferenceConstraintKind,
			payload: {
				field: 'acl',
				principalClassName: null,
				principalId: null,
				role: editor.value,
				subjectKind: 'role',
			},
			version: aclReferenceConstraintVersion,
		})
		expect(Object.isFrozen(principal.payload)).toBe(true)
	})
})
