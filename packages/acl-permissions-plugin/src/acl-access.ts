import {
	RequestSubjectReference,
	type Principal,
	type RequestSubjectContext,
	type RequestRoleReference,
	type RequestRoleResolver,
	type DatabaseRowFilterNode,
	type ExecutableOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACLPermission } from './acl-contracts.js'
import type { ACLContainmentOperand } from './acl-containment.js'
import { aclFieldName } from './acl-option.js'

/** Collects request-local subject resolution once for one ACL evaluation boundary. */
export interface ACLAccessSubjects {
	readonly principal: Principal | undefined
	readonly roleResolutionAvailable: boolean
	readonly roles: readonly RequestRoleReference[]
}

/**
 * Resolves the roles used by row and item decisions beside the Core principal
 * (ADR-0304), which Core already resolved and validated for the request.
 */
export const resolveACLAccessSubjects = async (
	context: RequestSubjectContext,
	principal: Principal | undefined,
	roleResolver: Partial<RequestRoleResolver> | undefined,
): Promise<ACLAccessSubjects> => {
	const roles: RequestRoleReference[] = []

	for (const [index, candidate] of (
		(await roleResolver?.resolveCurrentRoles?.({ context })) ?? []
	).entries()) {
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
		if (!roles.some(({ value }) => value === role.value)) {
			// Reconstructing erases unsafe generic arguments from an untrusted provider.
			roles.push(new RequestSubjectReference('role', role.value))
		}
	}

	return immutableRecord({
		principal,
		roleResolutionAvailable: roleResolver?.resolveCurrentRoles !== undefined,
		roles: immutableArray(roles),
	})
}

const containsLeaf = (value: ACLContainmentOperand): DatabaseRowFilterNode =>
	immutableRecord({ field: aclFieldName, kind: 'contains' as const, value })

/** Converts one required permission into ordinary portable subject alternatives. */
export const createACLPermissionRowFilter = (
	permission: ACLPermission,
	subjects: ACLAccessSubjects,
): DatabaseRowFilterNode => {
	const permissions = [permission] as const
	const alternatives = [containsLeaf({ public: permissions })]

	if (subjects.principal !== undefined) {
		const { className } = subjects.principal.toJSON()
		alternatives.push(
			containsLeaf({ authenticated: permissions }),
			containsLeaf({
				principals: [{ className, id: subjects.principal.id, permissions }],
			}),
		)
	}
	for (const { value } of subjects.roles) {
		alternatives.push(
			containsLeaf({ roles: [{ kind: 'role', permissions, value }] }),
		)
	}

	return immutableRecord({
		expressions: immutableArray(alternatives),
		kind: 'or' as const,
	})
}

/** Maps each terminal to its one object-level right; creation grants no ACL authority. */
export const requiredACLPermission = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
): ACLPermission | undefined => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return 'read'
		case 'delete-many':
		case 'delete-one':
			return 'delete'
		case 'update-many':
		case 'update-one':
		case 'upsert-one':
		case 'upsert-many':
			return 'update'
		case 'create-many':
		case 'create-one':
			return undefined
	}
}
