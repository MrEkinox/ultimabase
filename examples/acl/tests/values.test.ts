import { ACL } from '@ultimabase/acl-permissions-plugin'
import { expect, it } from 'vitest'

import { Editors, Member } from '../src/schema.ts'

// ACL values need no database: they are immutable data until a write
// stores them.

it('builds immutable ACL values', () => {
	const ada = Member.pointer('ada')

	//#region acl-value
	const value = new ACL()
		.grantPublic('read')
		.grantPrincipal(ada, 'read', 'write')
		.grantRole(Editors, 'read', 'update')

	const updated = value.revokePrincipal(ada, 'write')

	const document = updated.toJSON()
	const restored = ACL.fromJSON(JSON.parse(JSON.stringify(document)))
	//#endregion acl-value

	// Each change returns a new value; `'write'` means update and delete.
	expect(value.permissionsForPrincipal(ada)).toStrictEqual([
		'read',
		'update',
		'delete',
	])
	expect(updated.permissionsForPrincipal(ada)).toStrictEqual(['read'])
	expect(updated.permissionsForRole(Editors)).toStrictEqual(['read', 'update'])
	expect(updated.hasPublicPermission('read')).toBe(true)
	expect(restored.toJSON()).toStrictEqual(document)
	// `new ACL(owner)` grants read and write; without an owner it is empty.
	expect(new ACL(ada).permissionsForPrincipal(ada)).toStrictEqual(
		value.permissionsForPrincipal(ada),
	)
	expect(new ACL(undefined).entries()).toStrictEqual([])
})

it('parses ACL JSON strictly', () => {
	const document = new ACL().grantPublic('read').toJSON()

	expect(() => ACL.fromJSON({ ...document, owner: 'ada' })).toThrow(TypeError)
	expect(() => ACL.fromJSON({ ...document, version: 2 })).toThrow(TypeError)
	expect(() => ACL.fromJSON({ ...document, public: ['share'] })).toThrow(
		TypeError,
	)
	// Repeated rights are combined, then serialized in canonical order.
	expect(
		ACL.fromJSON({ ...document, public: ['update', 'read', 'read'] }).toJSON()
			.public,
	).toStrictEqual(['read', 'update'])
})
