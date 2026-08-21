import { describe, expect, it } from 'vitest'

import { snapshotACLContainmentOperand } from './acl-containment.js'

describe('ACL structural containment operands', () => {
	it('snapshots the narrow permission and subject fragments used by policies', () => {
		const permission = snapshotACLContainmentOperand(
			{ public: ['read'] },
			'acl filter',
		)
		const principal = snapshotACLContainmentOperand(
			{
				principals: [
					{ className: 'Principal', id: 'alice', permissions: ['update'] },
				],
			},
			'acl filter',
		)

		expect(permission).toStrictEqual({ public: ['read'] })
		expect(principal).toStrictEqual({
			principals: [
				{ className: 'Principal', id: 'alice', permissions: ['update'] },
			],
		})
		expect(Object.isFrozen(principal)).toBe(true)
	})

	it('rejects forged permissions, extra subject keys, and empty identities', () => {
		expect(() =>
			snapshotACLContainmentOperand({ public: ['execute'] }, 'acl filter'),
		).toThrow('must contain one ACL permission')
		expect(() =>
			snapshotACLContainmentOperand(
				{
					principals: [{ className: 'Principal', extra: true, id: 'alice' }],
				},
				'acl filter',
			),
		).toThrow('principal fragment has invalid keys')
		expect(() =>
			snapshotACLContainmentOperand(
				{ roles: [{ kind: 'role', value: '' }] },
				'acl filter',
			),
		).toThrow('role value')
	})
})
