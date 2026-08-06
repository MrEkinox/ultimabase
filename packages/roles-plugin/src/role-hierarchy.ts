import {
	Relation,
	type PersistedSchemaReference,
	type Pointer,
	type QueryTerminalOptions,
	type SchemaDefinition,
	type SchemaModelCapabilityContext,
} from '@ultimabase/core'

/** Bounds graph work when storage is corrupted or adversarial. */
export const roleHierarchyMaxDepth = 64
/** Bounds graph work independently from hierarchy depth. */
export const roleHierarchyMaxVisitedRoles = 10_000

/** Accepts only a detached Pointer or persisted role from the exact domain. */
export type NestedRoleTarget<TRoleSchema extends SchemaDefinition> =
	Pointer<TRoleSchema> | PersistedSchemaReference<TRoleSchema>

interface RoleHierarchyCommandReceiver<
	TRoleSchema extends SchemaDefinition,
> extends PersistedSchemaReference<TRoleSchema> {
	relation(fieldName: 'roles'): Relation<TRoleSchema, TRoleSchema>
}

/** Adds explicit hierarchy aliases only to persisted role results. */
export interface RoleHierarchyCommands<
	TRoleSchema extends SchemaDefinition,
	TInputRoleSchema extends SchemaDefinition = TRoleSchema,
> {
	/**
	 * Makes the supplied role a child of this role.
	 *
	 * `Administrator.addRole(Editor)` means every Editor member is inherited by
	 * Administrator. Runtime rejects self and indirect cycles before commit.
	 */
	addRole(
		this: RoleHierarchyCommandReceiver<TRoleSchema>,
		role: NestedRoleTarget<TInputRoleSchema>,
		options?: QueryTerminalOptions,
	): Promise<void>
	/** Removes one direct child role without changing either stored role. */
	removeRole(
		this: RoleHierarchyCommandReceiver<TRoleSchema>,
		role: NestedRoleTarget<TInputRoleSchema>,
		options?: QueryTerminalOptions,
	): Promise<void>
}

/** Creates relation-backed hierarchy aliases without retaining execution state. */
export const createRoleHierarchyCommands = <
	const TRoleSchema extends SchemaDefinition,
	const TInputRoleSchema extends SchemaDefinition = TRoleSchema,
>(
	context: SchemaModelCapabilityContext<TRoleSchema>,
): RoleHierarchyCommands<TRoleSchema, TInputRoleSchema> => ({
	addRole(role, options): Promise<void> {
		context.assertPersisted(this, 'addRole')
		const pointer = context.toPointer(
			context.schema,
			role as unknown as NestedRoleTarget<TRoleSchema>,
			'addRole',
		)

		return this.relation('roles').connect(pointer, options)
	},
	removeRole(role, options): Promise<void> {
		context.assertPersisted(this, 'removeRole')
		const pointer = context.toPointer(
			context.schema,
			role as unknown as NestedRoleTarget<TRoleSchema>,
			'removeRole',
		)

		return this.relation('roles').disconnect(pointer, options)
	},
})

/** Reports deterministic hierarchy failures without adding vocabulary to Core. */
export class RoleHierarchyError extends Error {
	readonly code: 'ROLE_HIERARCHY_CYCLE' | 'ROLE_HIERARCHY_LIMIT'

	constructor(
		code: 'ROLE_HIERARCHY_CYCLE' | 'ROLE_HIERARCHY_LIMIT',
		message: string,
	) {
		super(message)
		this.name = 'RoleHierarchyError'
		this.code = code
		Object.freeze(this)
	}
}

interface RoleHierarchyTraversalLimits {
	readonly maxDepth: number
	readonly maxVisitedRoles: number
}

type ReadChildRoles = (role: unknown) => Promise<readonly unknown[]>

/** Distinguishes one direct child from a role reached through inheritance. */
export interface ResolvedRoleHierarchyEntry {
	readonly depth: number
	readonly id: string
	readonly role: unknown
}

/** Retains one duplicate-free transitive role graph for later membership checks. */
export interface ResolvedRoleHierarchy {
	readonly all: readonly ResolvedRoleHierarchyEntry[]
	readonly direct: readonly ResolvedRoleHierarchyEntry[]
	readonly inherited: readonly ResolvedRoleHierarchyEntry[]
}

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

const readRolesRelation = (value: unknown): Relation => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Role hierarchy result must be a persisted model')
	}

	const relationMethod: unknown = Reflect.get(value, 'relation')

	if (typeof relationMethod !== 'function') {
		throw new TypeError('Role hierarchy result must expose its roles relation')
	}

	const invokeRelation = relationMethod as (
		this: object,
		fieldName: string,
	) => unknown
	const relation = invokeRelation.call(value, 'roles')

	if (!Relation.is(relation)) {
		throw new TypeError(
			'Role hierarchy result returned an invalid roles relation',
		)
	}

	return relation
}

/** Reads exact child roles in stable identifier order inside the active transaction. */
const readChildRoles = async (role: unknown): Promise<readonly unknown[]> =>
	readRolesRelation(role)
		.query()
		.select({ id: true })
		.ascending('id')
		.findMany({ useMasterKey: true })

/**
 * Rejects every cycle reachable from one changed role before its transaction commits.
 *
 * The active recursion stack distinguishes cycles from duplicate diamond paths;
 * the completed set prevents repeated traversal of the same valid subtree.
 */
export const resolveRoleHierarchyGraph = async (
	rootRole: unknown,
	readChildren: ReadChildRoles,
	limits: RoleHierarchyTraversalLimits,
): Promise<ResolvedRoleHierarchy> => {
	const activeRoleIds = new Set<string>()
	const completedRoleIds = new Set<string>()
	const childrenByRoleId = new Map<string, readonly unknown[]>()
	const rolesById = new Map<string, unknown>()
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
		rolesById.set(roleId, role)
		const children = await readChildren(role)
		childrenByRoleId.set(roleId, children)

		for (const childRole of children) {
			await visit(childRole, depth + 1)
		}

		activeRoleIds.delete(roleId)
		completedRoleIds.add(roleId)
	}

	await visit(rootRole, 0)
	const rootRoleId = readPersistedRoleId(rootRole)
	const minimumDepthByRoleId = new Map<string, number>()
	const pending: Readonly<{ depth: number; role: unknown }>[] = (
		childrenByRoleId.get(rootRoleId) ?? []
	).map((role) => ({ depth: 1, role }))

	for (const entry of pending) {
		const roleId = readPersistedRoleId(entry.role)
		const knownDepth = minimumDepthByRoleId.get(roleId)

		if (knownDepth !== undefined && knownDepth <= entry.depth) {
			continue
		}

		minimumDepthByRoleId.set(roleId, entry.depth)

		for (const child of childrenByRoleId.get(roleId) ?? []) {
			pending.push({ depth: entry.depth + 1, role: child })
		}
	}

	const all = [...minimumDepthByRoleId.entries()]
		.sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
		.map(([id, depth]) => Object.freeze({ depth, id, role: rolesById.get(id) }))
	const direct = all.filter(({ depth }) => depth === 1)
	const inherited = all.filter(({ depth }) => depth > 1)

	return Object.freeze({
		all: Object.freeze(all),
		direct: Object.freeze(direct),
		inherited: Object.freeze(inherited),
	})
}

/** Validates a supplied graph reader without exposing database execution. */
export const assertRoleHierarchyAcyclicGraph = async (
	rootRole: unknown,
	readChildren: ReadChildRoles,
	limits: RoleHierarchyTraversalLimits,
): Promise<void> => {
	await resolveRoleHierarchyGraph(rootRole, readChildren, limits)
}

/** Uses live role relations while preserving the request's active transaction. */
export const assertRoleHierarchyAcyclic = (rootRole: unknown): Promise<void> =>
	assertRoleHierarchyAcyclicGraph(rootRole, readChildRoles, {
		maxDepth: roleHierarchyMaxDepth,
		maxVisitedRoles: roleHierarchyMaxVisitedRoles,
	})

/** Resolves direct and inherited child roles through live relation queries. */
export const resolveRoleHierarchy = (
	rootRole: unknown,
): Promise<ResolvedRoleHierarchy> =>
	resolveRoleHierarchyGraph(rootRole, readChildRoles, {
		maxDepth: roleHierarchyMaxDepth,
		maxVisitedRoles: roleHierarchyMaxVisitedRoles,
	})
