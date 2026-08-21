import {
	RequestSubjectReference,
	resolveRequestPrincipal,
	type RequestSubjectContext,
	type RequestPrincipalResolver,
	type RequestRoleReference,
	type RequestRoleResolver,
	type DatabaseRowFilterNode,
	type ExecutableOperationAst,
	type PointerValue,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACLPermission } from './acl-contracts.js'
import type { ACLContainmentOperand } from './acl-containment.js'
import { aclFieldName } from './acl-extension.js'

/** Collects request-local subject resolution once for one ACL evaluation boundary. */
export interface ACLAccessSubjects {
	readonly principal: PointerValue | undefined
	readonly roleResolutionAvailable: boolean
	readonly roles: readonly RequestRoleReference[]
}

/** Resolves the optional identity capabilities used by row and item decisions. */
export const resolveACLAccessSubjects = async (
	context: RequestSubjectContext,
	principalResolver: RequestPrincipalResolver | undefined,
	roleResolver: RequestRoleResolver | undefined,
	ownsSchema: (schema: SchemaDefinition) => boolean,
): Promise<ACLAccessSubjects> => {
	const principal = await resolveRequestPrincipal({
		context,
		ownsSchema,
		resolver: principalResolver,
	})

	const roles = await roleResolver?.resolveCurrentRoles?.({ context })
	const normalizedRoles: RequestRoleReference[] = []

	for (const [index, candidate] of (roles ?? []).entries()) {
		const role: unknown = candidate

		if (
			!(role instanceof RequestSubjectReference) ||
			role.kind !== 'role' ||
			typeof role.value !== 'string'
		) {
			throw new TypeError(
				`ACL role resolver returned an invalid reference at index ${String(index)}`,
			)
		}

		if (!normalizedRoles.some(({ value }) => value === role.value)) {
			// Reconstructing erases unsafe generic arguments from an untrusted provider.
			normalizedRoles.push(new RequestSubjectReference('role', role.value))
		}
	}

	return immutableRecord({
		principal,
		roleResolutionAvailable: roleResolver?.resolveCurrentRoles !== undefined,
		roles: immutableArray(normalizedRoles),
	})
}

const createACLContainsLeaf = (
	value: ACLContainmentOperand,
): DatabaseRowFilterNode =>
	immutableRecord({ field: aclFieldName, kind: 'contains' as const, value })

/** Converts one required permission into ordinary portable subject alternatives. */
export const createACLPermissionRowFilter = (
	permission: ACLPermission,
	subjects: ACLAccessSubjects,
): DatabaseRowFilterNode => {
	const principal = subjects.principal?.toJSON()
	const alternatives: DatabaseRowFilterNode[] = [
		createACLContainsLeaf({ public: [permission] }),
	]

	if (principal !== undefined && subjects.principal !== undefined) {
		alternatives.push(
			createACLContainsLeaf({ authenticated: [permission] }),
			createACLContainsLeaf({
				principals: [
					{
						className: principal.className,
						id: subjects.principal.id,
						permissions: [permission],
					},
				],
			}),
		)
	}

	for (const role of subjects.roles) {
		alternatives.push(
			createACLContainsLeaf({
				roles: [{ kind: 'role', permissions: [permission], value: role.value }],
			}),
		)
	}

	return immutableRecord({
		expressions: immutableArray(alternatives),
		kind: 'or' as const,
	})
}

/** Maps one terminal to every ACL right its database predicate must require. */
export const requiredACLPermissions = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
): readonly ACLPermission[] => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return immutableArray(['read'])
		case 'delete-many':
		case 'delete-one':
			return immutableArray(['delete'])
		case 'update-many':
		case 'update-one':
			return immutableArray(['update'])
		case 'upsert-one':
			return immutableArray(['update'])
		case 'upsert-many':
			return immutableArray(['update'])
		case 'create-many':
		case 'create-one':
			return immutableArray([])
	}
}

/** Builds ACL's complete protected row predicate for one logical operation. */
export const createACLRowFilter = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
	subjects: ACLAccessSubjects,
): DatabaseRowFilterNode | undefined => {
	const filters = requiredACLPermissions(operation).map((permission) =>
		createACLPermissionRowFilter(permission, subjects),
	)
	const [first, ...rest] = filters

	if (first === undefined) return undefined
	if (rest.length === 0) return first

	return immutableRecord({
		expressions: immutableArray([first, ...rest]),
		kind: 'and' as const,
	})
}
