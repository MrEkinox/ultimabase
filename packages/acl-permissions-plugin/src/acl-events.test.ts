import { AccessSubjectReference, Schema } from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { ACL } from './acl.js'
import {
	aclChangedEvent,
	createACLChangeDiff,
	createACLChangedEvent,
	onACLChange,
} from './acl-events.js'

const User = Schema.define({ className: 'ACLChangeUser', fields: {} })
const alice = User.pointer('alice')
const bob = User.pointer('bob')
const editor = new AccessSubjectReference('role', 'role-editor')
const reviewer = new AccessSubjectReference('role', 'role-reviewer')

describe('ACL change events', () => {
	it('reports canonical additions and removals for every subject kind', () => {
		const previous = new ACL()
			.grantPublic('read')
			.grantAuthenticated('read')
			.grantPrincipal(alice, 'read', 'update')
			.grantPrincipal(bob, 'delete')
			.grantRole(editor, 'read', 'update')
		const current = previous
			.revokePublic('read')
			.grantAuthenticated('update')
			.setPrincipalPermissions(alice, 'delete')
			.revokePrincipal(bob, 'delete')
			.setRolePermissions(editor, 'read')
			.grantRole(reviewer, 'delete')

		expect(createACLChangeDiff(previous, current)).toStrictEqual({
			added: [
				{ permissions: ['update'], subject: { kind: 'authenticated' } },
				{
					permissions: ['delete'],
					subject: {
						className: User.className,
						id: alice.id,
						kind: 'principal',
					},
				},
				{
					permissions: ['delete'],
					subject: { kind: 'role', value: reviewer.value },
				},
			],
			removed: [
				{ permissions: ['read'], subject: { kind: 'public' } },
				{
					permissions: ['read', 'update'],
					subject: {
						className: User.className,
						id: alice.id,
						kind: 'principal',
					},
				},
				{
					permissions: ['delete'],
					subject: {
						className: User.className,
						id: bob.id,
						kind: 'principal',
					},
				},
				{
					permissions: ['update'],
					subject: { kind: 'role', value: editor.value },
				},
			],
		})
	})

	it('creates one detached audit payload with actor and target identity', () => {
		const payload = createACLChangedEvent({
			authority: 'master',
			className: 'Post',
			current: new ACL().grantPrincipal(alice, 'read'),
			itemId: 'post-1',
			operation: 'update-one',
			previous: new ACL(),
			principal: alice,
		})

		expect(payload).toStrictEqual({
			actor: {
				authority: 'master',
				principal: { className: User.className, id: alice.id },
			},
			diff: {
				added: [
					{
						permissions: ['read'],
						subject: {
							className: User.className,
							id: alice.id,
							kind: 'principal',
						},
					},
				],
				removed: [],
			},
			operation: 'update-one',
			target: { className: 'Post', id: 'post-1' },
		})
		expect(Object.isFrozen(payload)).toBe(true)
		expect(Object.isFrozen(payload.diff.added)).toBe(true)
	})

	it('creates one exact named-event consumer definition', () => {
		const handler = vi.fn()

		expect(onACLChange(handler)).toStrictEqual({
			kind: 'hook-event',
			name: aclChangedEvent,
		})
	})
})
