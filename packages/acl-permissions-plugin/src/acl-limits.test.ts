import {
	RequestSubjectReference,
	FrameworkError,
	UltimaBase,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { ACL } from './acl.js'
import {
	assertACLEntryLimits,
	defaultACLEntryLimits,
	normalizeACLEntryLimits,
	resolveACLEntryLimits,
} from './acl-limits.js'

const User = UltimaBase.Schema.define({
	className: 'ACLLimitUser',
	fields: () => ({}),
})
const alice = User.pointer('alice')
const bob = User.pointer('bob')
const editor = new RequestSubjectReference('role', 'role:editor')
const reviewer = new RequestSubjectReference('role', 'role:reviewer')

describe('ACL entry limits', () => {
	it('inherits omitted values and snapshots explicit overrides', () => {
		const options = { maxPrincipals: 25 }
		const normalized = normalizeACLEntryLimits(options, 'acl limits')

		options.maxPrincipals = 50
		const resolved = resolveACLEntryLimits(defaultACLEntryLimits, normalized)

		expect(resolved).toStrictEqual({ maxPrincipals: 25, maxRoles: 50 })
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(Object.isFrozen(resolved)).toBe(true)

		const schemaOverride = resolveACLEntryLimits(
			{ maxPrincipals: 1, maxRoles: 1 },
			{ maxPrincipals: 2 },
		)
		expect(schemaOverride).toStrictEqual({ maxPrincipals: 2, maxRoles: 1 })
	})

	it('counts canonical principals and roles rather than grant calls or rights', () => {
		const value = new ACL()
			.grantPublic('read', 'update')
			.grantAuthenticated('read')
			.grantPrincipal(alice, 'read')
			.grantPrincipal(alice, 'update', 'delete')
			.grantRole(editor, 'read')
			.grantRole(editor, 'update')

		expect(() => {
			assertACLEntryLimits(value, { maxPrincipals: 1, maxRoles: 1 })
		}).not.toThrow()
	})

	it('returns one typed validation error at each exact boundary', () => {
		const principals = new ACL()
			.grantPrincipal(alice, 'read')
			.grantPrincipal(bob, 'read')
		const roles = new ACL()
			.grantRole(editor, 'read')
			.grantRole(reviewer, 'read')

		for (const [value, subject] of [
			[principals, 'principal'],
			[roles, 'role'],
		] as const) {
			try {
				assertACLEntryLimits(value, { maxPrincipals: 1, maxRoles: 1 })
				throw new TypeError('Expected the ACL limit to reject the value')
			} catch (error) {
				expect(error).toBeInstanceOf(FrameworkError)
				expect(error).toMatchObject({
					code: 'VALIDATION_ERROR',
					internalDetails: {
						count: 2,
						kind: 'acl-entry-limit',
						limit: 1,
						subject,
					},
				})
			}
		}
	})

	it('rejects malformed finite limit declarations', () => {
		expect(() =>
			normalizeACLEntryLimits(
				{ maxPrincipals: Number.POSITIVE_INFINITY },
				'acl limits',
			),
		).toThrow('acl limits.maxPrincipals must be a non-negative safe integer')
		expect(() =>
			normalizeACLEntryLimits({ maxRoles: 1.5 }, 'acl limits'),
		).toThrow('acl limits.maxRoles must be a non-negative safe integer')
		expect(() =>
			normalizeACLEntryLimits({ extra: 1 } as never, 'acl limits'),
		).toThrow('Unknown acl limits option: extra')
	})
})
