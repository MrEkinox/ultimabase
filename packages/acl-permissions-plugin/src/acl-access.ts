import {
	AccessSubjectReference,
	databaseConstraint,
	resolveAccessPrincipal,
	type AccessContext,
	type AccessPrincipalResolver,
	type AccessRoleReference,
	type AccessRoleResolver,
	type DatabaseConstraintNode,
	type DatabaseConstraintPayloadObject,
	type ExecutableOperationAst,
	type PointerValue,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACLPermission } from './acl-contracts.js'
import { aclFieldName } from './acl-extension.js'

/** Names the adapter-neutral row predicate emitted by the ACL provider. */
export const aclRowConstraintKind = 'ultimabase.acl.row' as const

/** Selects the first stable ACL row-constraint payload contract. */
export const aclRowConstraintVersion = 1 as const

/** Carries already-resolved subjects to an adapter without exposing request state. */
export interface ACLRowConstraintPayload extends DatabaseConstraintPayloadObject {
	readonly field: typeof aclFieldName
	readonly permission: ACLPermission
	readonly principalClassName: string | null
	readonly principalId: string | null
	readonly roleResolutionAvailable: boolean
	readonly roles: readonly string[]
}

/** Represents the exact opaque node understood by ACL-aware adapters. */
export type ACLRowConstraint = DatabaseConstraintNode<
	typeof aclRowConstraintKind,
	typeof aclRowConstraintVersion,
	ACLRowConstraintPayload
>

/** Collects request-local subject resolution once for one ACL evaluation boundary. */
export interface ACLAccessSubjects {
	readonly principal: PointerValue | undefined
	readonly roleResolutionAvailable: boolean
	readonly roles: readonly AccessRoleReference[]
}

/** Resolves the optional identity capabilities used by row and item decisions. */
export const resolveACLAccessSubjects = async (
	context: AccessContext,
	principalResolver: AccessPrincipalResolver | undefined,
	roleResolver: AccessRoleResolver | undefined,
	ownsSchema: (schema: SchemaDefinition) => boolean,
): Promise<ACLAccessSubjects> => {
	const principal = await resolveAccessPrincipal({
		context,
		ownsSchema,
		resolver: principalResolver,
	})

	const roles = await roleResolver?.resolveCurrentRoles?.({ context })
	const normalizedRoles: AccessRoleReference[] = []

	for (const [index, candidate] of (roles ?? []).entries()) {
		const role: unknown = candidate

		if (
			!(role instanceof AccessSubjectReference) ||
			role.kind !== 'role' ||
			typeof role.value !== 'string'
		) {
			throw new TypeError(
				`ACL role resolver returned an invalid reference at index ${String(index)}`,
			)
		}

		if (!normalizedRoles.some(({ value }) => value === role.value)) {
			// Reconstructing erases unsafe generic arguments from an untrusted provider.
			normalizedRoles.push(new AccessSubjectReference('role', role.value))
		}
	}

	return immutableRecord({
		principal,
		roleResolutionAvailable: roleResolver?.resolveCurrentRoles !== undefined,
		roles: immutableArray(normalizedRoles),
	})
}

/** Converts trusted request subjects into one detached database constraint. */
export const createACLRowConstraint = (
	permission: ACLPermission,
	subjects: ACLAccessSubjects,
): ACLRowConstraint => {
	const principal = subjects.principal?.toJSON()

	return databaseConstraint(aclRowConstraintKind, aclRowConstraintVersion, {
		field: aclFieldName,
		permission,
		principalClassName: principal?.className ?? null,
		principalId: subjects.principal?.id ?? null,
		roleResolutionAvailable: subjects.roleResolutionAvailable,
		roles: subjects.roles.map(({ value }) => value),
	})
}

/** Maps one terminal to every ACL right its database predicate must require. */
export const requiredACLPermissions = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
): readonly ACLPermission[] => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
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
