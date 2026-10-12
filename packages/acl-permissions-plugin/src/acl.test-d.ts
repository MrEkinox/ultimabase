import {
	RequestSubjectReference,
	UltimaBase,
	type Pointer,
	type RequestRoleReference,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	ACL,
	aclPermissions,
	aclPlugin,
	type ACLEntry,
	type ACLEntryLimits,
	type ACLPermission,
	type ACLPrincipal,
	type ACLJSON,
	type ACLPlugin,
	type ACLPluginOptions,
	type ACLPrincipalJSON,
	type ACLRoleJSON,
} from './index.js'

const User = UltimaBase.Schema.define({
	className: 'TypedACLUser',
	fields: () => ({}),
})
const principal = User.pointer('principal-id')
const role = new RequestSubjectReference('role', 'role:editor')

test('keeps the complete ACL builder surface compact and precise', () => {
	const acl = new ACL()
		.grantPublic('read')
		.grantAuthenticated('read')
		.grantPrincipal(principal, 'read', 'update')
		.grantRole(role, 'delete')

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
	expectTypeOf(acl.toJSON()).toEqualTypeOf<ACLJSON>()
	expectTypeOf(ACL.fromJSON(acl.toJSON())).toEqualTypeOf<ACL>()
	expectTypeOf(acl.toJSON().principals).toEqualTypeOf<
		readonly ACLPrincipalJSON[]
	>()
	expectTypeOf(acl.toJSON().roles).toEqualTypeOf<readonly ACLRoleJSON[]>()
})

test('grants the owner and the write group (ADR-0321)', () => {
	expectTypeOf(new ACL(principal)).toEqualTypeOf<ACL>()
	expectTypeOf(new ACL(undefined)).toEqualTypeOf<ACL>()
	expectTypeOf(new ACL().grantPublic('read', 'write')).toEqualTypeOf<ACL>()
	expectTypeOf(
		new ACL().revokePrincipal(principal, 'write'),
	).toEqualTypeOf<ACL>()
	expectTypeOf(new ACL().entries()).toEqualTypeOf<readonly ACLEntry[]>()
	const [entry] = new ACL(principal).entries()
	if (entry?.kind === 'principal') {
		expectTypeOf(entry.principal).toEqualTypeOf<Pointer>()
	}
	if (entry?.kind === 'role') {
		expectTypeOf(entry.role).toEqualTypeOf<RequestRoleReference>()
	}
	// @ts-expect-error -- `write` is an input group, never a stored right.
	new ACL().hasPublicPermission('write')
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
	void acl.grantMaster
})

test('keeps plugin and schema entry limits explicit and finite at runtime', () => {
	const limits = {
		maxPrincipals: 100,
		maxRoles: 50,
	} satisfies ACLEntryLimits
	const options = { limits } satisfies ACLPluginOptions
	const plugin = aclPlugin(options)

	expectTypeOf(plugin).toEqualTypeOf<ACLPlugin>()
	expectTypeOf(options.limits.maxPrincipals).toBeNumber()
	// @ts-expect-error -- Entry-limit keys are closed for reliable autocomplete.
	aclPlugin({ limits: { maxGroups: 10 } })
	// @ts-expect-error -- Limits are numeric bounds rather than transport strings.
	aclPlugin({ limits: { maxRoles: '50' } })
})
