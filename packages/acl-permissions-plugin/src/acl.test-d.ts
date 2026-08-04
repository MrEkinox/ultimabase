import {
	AccessSubjectReference,
	Schema,
	type AccessRoleReferenceCarrier,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	ACL,
	aclPermissions,
	type ACLPermission,
	type ACLPrincipal,
} from './index.js'

const User = Schema.define({ className: 'TypedACLUser', fields: {} })
const principal = User.pointer('principal-id')
const role = new AccessSubjectReference('role', 'role:editor')
const persistedRole: AccessRoleReferenceCarrier = {
	toAccessRoleReference: () => role,
}

test('keeps the complete ACL builder surface compact and precise', () => {
	const acl = new ACL()
		.grantPublic('read')
		.grantAuthenticated('read')
		.grantPrincipal(principal, 'read', 'update')
		.grantRole(persistedRole, 'delete')

	expectTypeOf(acl).toEqualTypeOf<ACL>()
	expectTypeOf(principal).toExtend<ACLPrincipal>()
	expectTypeOf(aclPermissions).toEqualTypeOf<readonly ACLPermission[]>()
	expectTypeOf(acl.permissionsForPublic()).toEqualTypeOf<
		readonly ACLPermission[]
	>()
	expectTypeOf(acl.permissionsForAuthenticated()).toEqualTypeOf<
		readonly ACLPermission[]
	>()
	expectTypeOf(acl.permissionsForPrincipal(principal)).toEqualTypeOf<
		readonly ACLPermission[]
	>()
	expectTypeOf(acl.permissionsForRole(role)).toEqualTypeOf<
		readonly ACLPermission[]
	>()
	expectTypeOf(acl.hasPrincipalPermission(principal, 'read')).toBeBoolean()
	expectTypeOf(acl.hasRolePermission(role, 'delete')).toBeBoolean()
})

test('rejects ambiguous subjects and unknown rights at compile time', () => {
	const acl = new ACL()

	// @ts-expect-error -- Principals must retain exact schema identity through Pointer.
	acl.grantPrincipal({ id: 'principal-id' }, 'read')
	// @ts-expect-error -- Raw role strings cannot bypass neutral role references.
	acl.grantRole('editor', 'read')
	// @ts-expect-error -- ACL owns one closed object-right vocabulary.
	acl.grantPublic('create')
	// @ts-expect-error -- Master is an execution authority, never an ACL subject.
	acl.grantMaster('read')
})
