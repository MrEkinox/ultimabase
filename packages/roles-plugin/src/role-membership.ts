import {
	Query,
	type Pointer,
	type RelationField,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	readPersistedRoleId,
	RoleHierarchyError,
	roleHierarchyMaxDepth,
	roleHierarchyMaxVisitedRoles,
} from './role-hierarchy.js'

type MembershipMemberSchema = SchemaDefinition<
	string,
	Readonly<Record<never, never>>
>

type MembershipRoleSchema = SchemaDefinition<
	string,
	Readonly<{
		readonly members: RelationField<MembershipMemberSchema>
		readonly roles: RelationField<MembershipRoleSchema>
	}>
>

/** Retains one request-local, duplicate-free stored membership closure. */
export interface RoleMembershipSnapshot {
	readonly allRoleIds: readonly string[]
	readonly directRoleIds: readonly string[]
	readonly inheritedRoleIds: readonly string[]
	readonly memberId: string
}

type ReadParentRoles = (role: unknown) => Promise<readonly unknown[]>

/** Resolves a portable ancestor graph independently from database execution. */
export const resolveRoleMembershipGraph = async (
	memberId: string,
	directRoles: readonly unknown[],
	readParents: ReadParentRoles,
): Promise<RoleMembershipSnapshot> => {
	const minimumDepthByRoleId = new Map<string, number>()
	const pending: { readonly depth: number; readonly role: unknown }[] =
		directRoles.map((role) => ({ depth: 0, role }))
	let cursor = 0

	while (cursor < pending.length) {
		const entry = pending[cursor]
		cursor += 1

		if (entry === undefined) {
			continue
		}

		const roleId = readPersistedRoleId(entry.role)
		const knownDepth = minimumDepthByRoleId.get(roleId)

		if (knownDepth !== undefined && knownDepth <= entry.depth) {
			continue
		}

		if (entry.depth > roleHierarchyMaxDepth) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role membership exceeds maximum depth ${String(roleHierarchyMaxDepth)}`,
			)
		}

		minimumDepthByRoleId.set(roleId, entry.depth)

		if (minimumDepthByRoleId.size > roleHierarchyMaxVisitedRoles) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role membership exceeds maximum visited roles ${String(roleHierarchyMaxVisitedRoles)}`,
			)
		}

		for (const parent of await readParents(entry.role)) {
			pending.push({ depth: entry.depth + 1, role: parent })
		}
	}

	const allRoleIds = [...minimumDepthByRoleId.keys()].sort((left, right) =>
		left.localeCompare(right),
	)
	const directRoleIds = allRoleIds.filter(
		(roleId) => minimumDepthByRoleId.get(roleId) === 0,
	)
	const inheritedRoleIds = allRoleIds.filter(
		(roleId) => minimumDepthByRoleId.get(roleId) !== 0,
	)

	return immutableRecord({
		allRoleIds: immutableArray(allRoleIds),
		directRoleIds: immutableArray(directRoleIds),
		inheritedRoleIds: immutableArray(inheritedRoleIds),
		memberId,
	})
}

/** Resolves direct roles and their ancestors through ordinary protected Query. */
export const resolveStoredRoleMembership = async (
	schema: SchemaDefinition,
	member: Pointer,
): Promise<RoleMembershipSnapshot> => {
	const lookupSchema = schema as unknown as MembershipRoleSchema
	const directRoles = await new Query(lookupSchema)
		.where((where) =>
			where.some('members', (candidate) => candidate.eq('id', member.id)),
		)
		.ascending('id')
		.findMany({ useMasterKey: true })

	return resolveRoleMembershipGraph(member.id, directRoles, async (role) => {
		const roleId = readPersistedRoleId(role)

		return new Query(lookupSchema)
			.where((where) =>
				where.some('roles', (candidate) => candidate.eq('id', roleId)),
			)
			.ascending('id')
			.findMany({ useMasterKey: true })
	})
}
