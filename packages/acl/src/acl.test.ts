// The `ACL` class (D-124): immutable entries, read one by one, listed, asked
// for a caller and converted.
import { asUser } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { ACL } from './index.ts'

const ada = { id: 'u_ada' }
const bob = { id: 'u_bob' }
const editor = { id: 'r_editor' }

describe('an ACL', () => {
	it('is empty when new, and each method returns a new one', () => {
		const empty = new ACL()
		const shared = empty.allowUser(ada)
		expect(empty.entries()).toEqual([])
		expect(shared.entries()).toEqual(['read:user:u_ada', 'write:user:u_ada'])
		expect(shared.denyUser(ada, 'write').entries()).toEqual(['read:user:u_ada'])
		expect(shared.entries()).toHaveLength(2)
	})

	it('allows and denies the public, a user and a role', () => {
		const acl = new ACL()
			.allowPublic('read')
			.allowUser(ada, 'read', 'write')
			.allowUser(bob, 'read')
			.allowRole(editor, 'write')
		expect(acl.publicCan('read')).toBe(true)
		expect(acl.publicCan('write')).toBe(false)
		expect(acl.userCan(ada, 'write')).toBe(true)
		expect(acl.userCan(bob, 'write')).toBe(false)
		expect(acl.roleCan(editor, 'write')).toBe(true)
		expect(acl.users('read')).toEqual(['u_ada', 'u_bob'])
		expect(acl.users('write')).toEqual(['u_ada'])
		expect(acl.roles('write')).toEqual(['r_editor'])
		const denied = acl.denyPublic().denyRole(editor).denyUser(bob)
		expect(denied.entries()).toEqual(['read:user:u_ada', 'write:user:u_ada'])
	})

	it('answers for a caller: the public, its user, and Master', () => {
		const acl = new ACL().allowPublic('read').allowUser(ada, 'write')
		const anonymous = { kind: 'anonymous' } as const
		expect(acl.allows(anonymous, 'read')).toBe(true)
		expect(acl.allows(anonymous, 'write')).toBe(false)
		expect(acl.allows(asUser(ada), 'write')).toBe(true)
		expect(acl.allows(asUser(bob), 'write')).toBe(false)
		expect(new ACL().allows(master, 'write')).toBe(true)
		// A write needs the read, as the queries do.
		const blind = new ACL().allowUser(bob, 'write')
		expect(blind.allows(asUser(bob), 'write')).toBe(false)
	})

	it('converts to and from its entries and its JSON', () => {
		const acl = new ACL().allowPublic('read').allowRole(editor)
		expect(acl.toJSON()).toEqual({
			read: ['*', 'role:r_editor'],
			write: ['role:r_editor'],
		})
		expect(JSON.stringify(acl)).toBe(
			'{"read":["*","role:r_editor"],"write":["role:r_editor"]}',
		)
		expect(ACL.fromJSON(acl.toJSON()).entries()).toEqual(acl.entries())
		expect(ACL.fromJSON(acl)).toBe(acl)
		expect(ACL.fromJSON({ read: ['user:u_ada'] }).entries()).toEqual([
			'read:user:u_ada',
		])
		expect(ACL.fromEntries(acl.entries()).toJSON()).toEqual(acl.toJSON())
	})

	it('refuses what is not an ACL', () => {
		expect(() => ACL.fromEntries(['read:user:'])).toThrow(
			'read:user: is not an ACL entry.',
		)
		expect(() => ACL.fromEntries(['admin:*'])).toThrow('not an ACL entry')
		expect(() => ACL.fromJSON('*')).toThrow(
			'An ACL is an ACL or { read, write }.',
		)
		expect(() => ACL.fromJSON(null)).toThrow('An ACL is an ACL')
		expect(() => ACL.fromJSON({ delete: [] })).toThrow(
			'delete is not a permission.',
		)
		expect(() => ACL.fromJSON({ read: '*' })).toThrow(
			'read is a list of subjects.',
		)
		expect(() => ACL.fromJSON({ write: ['*', 'team:1'] })).toThrow(
			'write[1]: a subject is *, user:<id> or role:<id>.',
		)
	})
})
