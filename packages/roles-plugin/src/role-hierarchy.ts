import { Schema } from '@ultimabase/core'
import { isUnknownArray } from '@ultimabase/shared'

/** Bounds graph work when storage is corrupted or adversarial. */
export const roleHierarchyMaxDepth = 64
/** Bounds graph work independently from hierarchy depth. */
export const roleHierarchyMaxVisitedRoles = 10_000

/** Reports deterministic hierarchy failures without adding vocabulary to Core. */
export class RoleHierarchyError extends Error {
	constructor(
		readonly code: 'ROLE_HIERARCHY_CYCLE' | 'ROLE_HIERARCHY_LIMIT',
		message: string,
	) {
		super(message)
		this.name = 'RoleHierarchyError'
		Object.freeze(this)
	}
}

/** Reads the framework id of a persisted role model without trusting its shape. */
export const readPersistedRoleId = (value: unknown): string => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Role hierarchy result must be a persisted model')
	}

	const id: unknown = Reflect.get(value, 'id')

	if (typeof id !== 'string') {
		throw new TypeError('Role hierarchy result must expose its persisted id')
	}

	return id
}

/**
 * Reads exact child roles in stable identifier order inside the active
 * transaction, through an ordinary `include` (ADR-0310).
 */
const readChildRoles =
	(schema: unknown) =>
	async (role: unknown): Promise<readonly unknown[]> => {
		if (!Schema.is(schema)) {
			throw new TypeError('Role hierarchy requires a role schema')
		}
		const parent = await schema.findOne(
			{
				where: { id: readPersistedRoleId(role) },
				select: { id: true },
				include: {
					includedRoles: { select: { id: true }, orderBy: { id: 'asc' } },
				},
			},
			{ useMasterKey: true },
		)
		const children: unknown =
			parent === null ? [] : Reflect.get(parent, 'includedRoles')
		if (!isUnknownArray(children)) {
			throw new TypeError('Role hierarchy result must include its roles')
		}
		return children
	}

/**
 * Rejects every cycle reachable from one changed role before its transaction commits.
 *
 * The active recursion stack distinguishes cycles from duplicate diamond paths;
 * the completed set prevents repeated traversal of the same valid subtree.
 */
export const assertRoleHierarchyAcyclicGraph = async (
	rootRole: unknown,
	readChildren: (role: unknown) => Promise<readonly unknown[]>,
	limits: Readonly<{ maxDepth: number; maxVisitedRoles: number }>,
): Promise<void> => {
	const activeRoleIds = new Set<string>()
	const completedRoleIds = new Set<string>()
	let visitedRoles = 0

	const visit = async (role: unknown, depth: number): Promise<void> => {
		const roleId = readPersistedRoleId(role)

		if (activeRoleIds.has(roleId)) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_CYCLE',
				`Role hierarchy cycle detected at ${roleId}`,
			)
		}
		if (completedRoleIds.has(roleId)) {
			return
		}
		if (depth > limits.maxDepth) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role hierarchy exceeds maximum depth ${String(limits.maxDepth)}`,
			)
		}

		visitedRoles += 1

		if (visitedRoles > limits.maxVisitedRoles) {
			throw new RoleHierarchyError(
				'ROLE_HIERARCHY_LIMIT',
				`Role hierarchy exceeds maximum visited roles ${String(limits.maxVisitedRoles)}`,
			)
		}

		activeRoleIds.add(roleId)
		const children = await readChildren(role)

		for (const childRole of children) {
			await visit(childRole, depth + 1)
		}

		activeRoleIds.delete(roleId)
		completedRoleIds.add(roleId)
	}

	await visit(rootRole, 0)
}

/** Uses live role relations while preserving the request's active transaction. */
export const assertRoleHierarchyAcyclic = (
	schema: unknown,
	rootRole: unknown,
): Promise<void> =>
	assertRoleHierarchyAcyclicGraph(rootRole, readChildRoles(schema), {
		maxDepth: roleHierarchyMaxDepth,
		maxVisitedRoles: roleHierarchyMaxVisitedRoles,
	})
