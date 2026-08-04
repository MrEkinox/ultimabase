import { describe, expect, it } from 'vitest'

import type { RoleHierarchyError } from './role-hierarchy.js'
import { resolveRoleMembershipGraph } from './role-membership.js'

interface MembershipRole {
	readonly id: string
	readonly parents: readonly MembershipRole[]
}

const role = (
	id: string,
	parents: readonly MembershipRole[] = [],
): MembershipRole => ({ id, parents })

const readParents = (value: unknown): Promise<readonly unknown[]> => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Membership fixture must be an object')
	}

	const parents: unknown = Reflect.get(value, 'parents')

	if (!Array.isArray(parents)) {
		throw new TypeError('Membership fixture parents must be an array')
	}

	return Promise.resolve(parents)
}

describe('stored role membership traversal', () => {
	it('distinguishes direct roles from inherited parents across diamond paths', async () => {
		const administrator = role('administrator')
		const publisher = role('publisher', [administrator])
		const reviewer = role('reviewer', [administrator])
		const editor = role('editor', [publisher, reviewer])
		const snapshot = await resolveRoleMembershipGraph(
			'member-1',
			[editor],
			readParents,
		)

		expect(snapshot).toStrictEqual({
			allRoleIds: ['administrator', 'editor', 'publisher', 'reviewer'],
			directRoleIds: ['editor'],
			inheritedRoleIds: ['administrator', 'publisher', 'reviewer'],
			memberId: 'member-1',
		})
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(snapshot.allRoleIds)).toBe(true)
	})

	it('keeps a role direct when another path also reaches it indirectly', async () => {
		const administrator = role('administrator')
		const editor = role('editor', [administrator])
		const snapshot = await resolveRoleMembershipGraph(
			'member-2',
			[editor, administrator],
			readParents,
		)

		expect(snapshot.directRoleIds).toStrictEqual(['administrator', 'editor'])
		expect(snapshot.inheritedRoleIds).toStrictEqual([])
	})

	it('fails explicitly when an adversarial ancestor graph exceeds depth', async () => {
		let current = role('root')

		for (let depth = 0; depth < 65; depth += 1) {
			current = role(`parent-${String(depth)}`, [current])
		}

		await expect(
			resolveRoleMembershipGraph('member-3', [current], readParents),
		).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_LIMIT',
		} satisfies Partial<RoleHierarchyError>)
	})
})
