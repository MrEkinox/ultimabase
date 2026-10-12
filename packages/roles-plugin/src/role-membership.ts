import type { Pointer, SchemaDefinition } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readPersistedRoleId,
	RoleHierarchyError,
	roleHierarchyMaxDepth,
	roleHierarchyMaxVisitedRoles,
} from './role-hierarchy.js'
import { roleQuerySchema } from './role-resolution.js'

/** Retains one request-local, duplicate-free stored membership closure. */
export interface RoleMembershipSnapshot {
	readonly allRoleIds: readonly string[]
	/** Canonical role names by role id, for every role in `allRoleIds`. */
	readonly roleNames: ReadonlyMap<string, string>
	readonly directRoleIds: readonly string[]
	readonly inheritedRoleIds: readonly string[]
	readonly memberId: string
}

/** Resolves a portable ancestor graph independently from database execution. */
export const resolveRoleMembershipGraph = async (
	memberId: string,
	directRoles: readonly unknown[],
	readParents: (role: unknown) => Promise<readonly unknown[]>,
): Promise<RoleMembershipSnapshot> => {
	const minimumDepthByRoleId = new Map<string, number>()
	const roleNames = new Map<string, string>()
	const pending = directRoles.map((role) => ({ depth: 0, role }))

	// Breadth-first: `for...of` also visits entries appended during iteration.
	for (const { depth, role } of pending) {
		const roleId = readPersistedRoleId(role)
		const knownDepth = minimumDepthByRoleId.get(roleId)

		if (knownDepth !== undefined && knownDepth <= depth) continue

		if (depth > roleHierarchyMaxDepth) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role membership exceeds maximum depth ${String(roleHierarchyMaxDepth)}`,
			)
		}

		minimumDepthByRoleId.set(roleId, depth)
		const name: unknown =
			typeof role === 'object' && role !== null
				? Reflect.get(role, 'name')
				: undefined
		if (typeof name === 'string') roleNames.set(roleId, name)

		if (minimumDepthByRoleId.size > roleHierarchyMaxVisitedRoles) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role membership exceeds maximum visited roles ${String(roleHierarchyMaxVisitedRoles)}`,
			)
		}

		for (const parent of await readParents(role)) {
			pending.push({ depth: depth + 1, role: parent })
		}
	}

	const allRoleIds = [...minimumDepthByRoleId.keys()].sort((left, right) =>
		left.localeCompare(right),
	)

	return immutableRecord({
		allRoleIds: immutableArray(allRoleIds),
		roleNames,
		directRoleIds: immutableArray(
			allRoleIds.filter((roleId) => minimumDepthByRoleId.get(roleId) === 0),
		),
		inheritedRoleIds: immutableArray(
			allRoleIds.filter((roleId) => minimumDepthByRoleId.get(roleId) !== 0),
		),
		memberId,
	})
}

/** Resolves direct roles and their ancestors through ordinary protected QueryBuilder. */
export const resolveStoredRoleMembership = async (
	schema: SchemaDefinition,
	member: Pointer,
): Promise<RoleMembershipSnapshot> => {
	const roles = roleQuerySchema(schema)
	const directRoles = await roles.findMany(
		{
			where: { members: { some: { id: { eq: member.id } } } },
			orderBy: { id: 'asc' },
		},
		{ useMasterKey: true },
	)

	return resolveRoleMembershipGraph(member.id, directRoles, async (role) =>
		roles.findMany(
			{
				where: {
					includedRoles: { some: { id: { eq: readPersistedRoleId(role) } } },
				},
				orderBy: { id: 'asc' },
			},
			{ useMasterKey: true },
		),
	)
}
