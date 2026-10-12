import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'
import {
	ACLChange,
	isACLChangeValue,
	snapshotACLUpdateInput,
} from './acl-change.js'

const User = UltimaBase.Schema.define({
	className: 'ACLChangeUser',
	fields: () => ({}),
})
const alice = User.pointer('alice')

describe('ACL update changes (ADR-0321)', () => {
	it('parses grant and revoke and applies them to the current ACL', () => {
		const grant = snapshotACLUpdateInput(
			{ grant: { principal: alice, permissions: ['read', 'write'] } },
			'Post.acl',
		)
		const revokeAll = snapshotACLUpdateInput(
			{ revoke: { principal: alice } },
			'Post.acl',
		)
		const revokeWrite = snapshotACLUpdateInput(
			{ revoke: { principal: alice, permissions: ['write'] } },
			'Post.acl',
		)

		expect(grant).toBeInstanceOf(ACLChange)
		if (
			!(grant instanceof ACLChange) ||
			!(revokeAll instanceof ACLChange) ||
			!(revokeWrite instanceof ACLChange)
		) {
			throw new TypeError('Expected ACL changes')
		}
		const shared = grant.applyTo(new ACL().grantPublic('read'))
		expect(shared.permissionsForPrincipal(alice)).toStrictEqual([
			'read',
			'update',
			'delete',
		])
		expect(
			revokeWrite.applyTo(shared).permissionsForPrincipal(alice),
		).toStrictEqual(['read'])
		expect(revokeAll.applyTo(shared).toJSON()).toStrictEqual(
			new ACL().grantPublic('read').toJSON(),
		)
		expect(Object.isFrozen(grant)).toBe(true)
	})

	it('keeps complete ACL values and recognizes raw changes', () => {
		const acl = new ACL()

		expect(snapshotACLUpdateInput(acl, 'Post.acl')).toBe(acl)
		expect(isACLChangeValue({ grant: {} })).toBe(true)
		expect(isACLChangeValue({ revoke: {} })).toBe(true)
		expect(isACLChangeValue({ grant: {}, revoke: {} })).toBe(false)
		expect(isACLChangeValue(acl)).toBe(false)
	})

	it('rejects malformed changes with the field path', () => {
		expect(() => snapshotACLUpdateInput({ replace: {} }, 'Post.acl')).toThrow(
			new TypeError(
				'Post.acl must be an ACL, { grant: { principal, permissions } } or { revoke: { principal } }',
			),
		)
		expect(() =>
			snapshotACLUpdateInput(
				{ grant: { principal: { id: 'x' }, permissions: ['read'] } },
				'Post.acl',
			),
		).toThrow(new TypeError('Post.acl.grant.principal must be a Pointer'))
		expect(() =>
			snapshotACLUpdateInput(
				{ grant: { principal: alice, permissions: [] } },
				'Post.acl',
			),
		).toThrow(new TypeError('Post.acl.grant.permissions must not be empty'))
		expect(() =>
			snapshotACLUpdateInput(
				{ grant: { principal: alice, permissions: ['share'] } },
				'Post.acl',
			),
		).toThrow(
			new TypeError('Post.acl.grant.permissions must list ACL permissions'),
		)
		expect(() =>
			snapshotACLUpdateInput(
				{ revoke: { principal: alice, until: 'tomorrow' } },
				'Post.acl',
			),
		).toThrow(new TypeError('Unknown Post.acl.revoke key: until'))
	})
})
