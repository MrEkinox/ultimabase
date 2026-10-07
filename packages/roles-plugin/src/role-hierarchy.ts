import {
	Relation,
	type PersistedSchemaReference,
	type Pointer,
	type OperationOptions,
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
	relation(fieldName: 'roles'): {
		connect(roleId: string, options?: OperationOptions): Promise<void>
		disconnect(roleId: string, options?: OperationOptions): Promise<void>
	}
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
		options?: OperationOptions,
	): Promise<void>
	/** Removes one direct child role without changing either stored role. */
	removeRole(
		this: RoleHierarchyCommandReceiver<TRoleSchema>,
		role: NestedRoleTarget<TInputRoleSchema>,
		options?: OperationOptions,
	): Promise<void>
}

/** Creates relation-backed hierarchy aliases without retaining execution state. */
export const createRoleHierarchyCommands = <
	const TRoleSchema extends SchemaDefinition,
>(
	context: SchemaModelCapabilityContext<TRoleSchema>,
): RoleHierarchyCommands<TRoleSchema> => ({
	addRole(role, options): Promise<void> {
		context.assertPersisted(this, 'addRole')
		const pointer = context.toPointer(context.schema, role, 'addRole')

		return this.relation('roles').connect(pointer.id, options)
	},
	removeRole(role, options): Promise<void> {
		context.assertPersisted(this, 'removeRole')
		const pointer = context.toPointer(context.schema, role, 'removeRole')

		return this.relation('roles').disconnect(pointer.id, options)
	},
})

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

/** Calls a persisted model's generated relation accessor without trusting its shape. */
export const readRoleRelation = (
	role: object,
	fieldName: 'members' | 'roles',
	missingMessage: string,
	invalidMessage: string,
): Relation => {
	const relationMethod: unknown = Reflect.get(role, 'relation')

	if (typeof relationMethod !== 'function') {
		throw new TypeError(missingMessage)
	}

	const relation: unknown = Reflect.apply(relationMethod, role, [fieldName])

	if (!Relation.is(relation)) {
		throw new TypeError(invalidMessage)
	}

	return relation
}

/** Reads exact child roles in stable identifier order inside the active transaction. */
const readChildRoles = async (role: unknown): Promise<readonly unknown[]> => {
	if (typeof role !== 'object' || role === null) {
		throw new TypeError('Role hierarchy result must be a persisted model')
	}

	return readRoleRelation(
		role,
		'roles',
		'Role hierarchy result must expose its roles relation',
		'Role hierarchy result returned an invalid roles relation',
	).findMany(
		{ select: { id: true }, orderBy: { id: 'asc' } },
		{ useMasterKey: true },
	)
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
export const assertRoleHierarchyAcyclic = (rootRole: unknown): Promise<void> =>
	assertRoleHierarchyAcyclicGraph(rootRole, readChildRoles, {
		maxDepth: roleHierarchyMaxDepth,
		maxVisitedRoles: roleHierarchyMaxVisitedRoles,
	})
