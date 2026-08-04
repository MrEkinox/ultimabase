import { describe, expect, it } from 'vitest'

import {
	assertRoleHierarchyAcyclicGraph,
	resolveRoleHierarchyGraph,
} from './role-hierarchy.js'
import type { RoleHierarchyError } from './role-hierarchy.js'

interface TestRole {
	readonly children: readonly TestRole[]
	readonly id: string
}

const role = (id: string, children: readonly TestRole[] = []): TestRole => ({
	children,
	id,
})

const readChildren = (value: unknown): Promise<readonly unknown[]> => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Test role must be an object')
	}

	const children: unknown = Reflect.get(value, 'children')

	if (!Array.isArray(children)) {
		throw new TypeError('Test role children must be an array')
	}

	return Promise.resolve(children)
}

const generousLimits = { maxDepth: 16, maxVisitedRoles: 100 }

describe('role hierarchy traversal', () => {
	it('accepts deep and diamond-shaped acyclic graphs without duplicate failure', async () => {
		const leaf = role('leaf')
		const left = role('left', [leaf])
		const right = role('right', [leaf])
		const root = role('root', [left, right])

		await expect(
			assertRoleHierarchyAcyclicGraph(root, readChildren, generousLimits),
		).resolves.toBeUndefined()
	})

	it('distinguishes direct and inherited roles by their shortest path', async () => {
		const leaf = role('leaf')
		const direct = role('direct', [leaf])
		const root = role('root', [direct, leaf])
		const resolution = await resolveRoleHierarchyGraph(
			root,
			readChildren,
			generousLimits,
		)

		expect(resolution.direct.map(({ id }) => id)).toStrictEqual([
			'direct',
			'leaf',
		])
		expect(resolution.inherited).toStrictEqual([])
		expect(resolution.all.map(({ id }) => id)).toStrictEqual(['direct', 'leaf'])
		expect(Object.isFrozen(resolution)).toBe(true)
	})

	it('rejects self and indirect cycles deterministically', async () => {
		const selfChildren: TestRole[] = []
		const self = role('self', selfChildren)
		selfChildren.push(self)

		await expect(
			assertRoleHierarchyAcyclicGraph(self, readChildren, generousLimits),
		).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_CYCLE',
		} satisfies Partial<RoleHierarchyError>)

		const firstChildren: TestRole[] = []
		const first = role('first', firstChildren)
		const second = role('second', [first])
		firstChildren.push(second)

		await expect(
			assertRoleHierarchyAcyclicGraph(first, readChildren, generousLimits),
		).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_CYCLE',
		} satisfies Partial<RoleHierarchyError>)
	})

	it('fails explicitly when depth or visited-role bounds are exceeded', async () => {
		const leaf = role('leaf')
		const middle = role('middle', [leaf])
		const root = role('root', [middle])

		await expect(
			assertRoleHierarchyAcyclicGraph(root, readChildren, {
				maxDepth: 1,
				maxVisitedRoles: 100,
			}),
		).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_LIMIT',
		} satisfies Partial<RoleHierarchyError>)
		await expect(
			assertRoleHierarchyAcyclicGraph(root, readChildren, {
				maxDepth: 16,
				maxVisitedRoles: 2,
			}),
		).rejects.toMatchObject({
			code: 'ROLE_HIERARCHY_LIMIT',
		} satisfies Partial<RoleHierarchyError>)
	})
})
