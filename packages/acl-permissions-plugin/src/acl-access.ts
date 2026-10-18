import {
	RequestSubjectReference,
	type Principal,
	type RequestSubjectContext,
	type DatabaseRowFilterNode,
	type ExecutableOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import { type PluginSchemaMutationEffect } from '@ultimabase/core/plugin'
import {
	type RequestRoleReference,
	type RequestRoleResolver,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isACLChangeValue } from './acl-change.js'
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

const isSystemField = (schema: SchemaDefinition, field: unknown): boolean => {
	if (typeof field !== 'string') return false
	const options: unknown = schema.persistedFields[field]?.options
	return isPlainRecord(options) && options.system === true
}

/**
 * Recognizes an update that only shares the row (`grant`/`revoke`, plus
 * framework timestamps): `clientSharing` authorizes it on a row the caller
 * reads, instead of the `update` right (ADR-0321).
 */
const isSharingUpdate = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
): boolean => {
	if (operation.kind !== 'update-one') return false
	const update: unknown = operation.update
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return false
	}
	const schema = operation.query.schema.definition
	let shares = false
	for (const candidate of update.operations) {
		if (!isPlainRecord(candidate)) return false
		if (candidate.field === aclFieldName && isACLChangeValue(candidate.value)) {
			shares = true
		} else if (!isSystemField(schema, candidate.field)) {
			return false
		}
	}
	return shares
}

/** Maps each terminal to its one object-level right; creation grants no ACL authority. */
export const requiredACLPermission = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
	clientSharing = false,
): ACLPermission | undefined => {
	if (clientSharing && isSharingUpdate(operation)) {
		return 'read'
	}
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

/**
 * Maps a plugin command to the right of its declared effect, like the native
 * write it performs; the command's name never matters (ADR-0348).
 */
export const requiredPluginCommandACLPermission = (
	effect: PluginSchemaMutationEffect,
): ACLPermission => {
	switch (effect) {
		case 'delete':
			return 'delete'
		case 'update':
			return 'update'
	}
}
