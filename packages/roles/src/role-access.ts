import {
	AccessSubjectReference,
	accessRoleResolverServiceToken,
	getCurrentApplication,
	getCurrentEngine,
	getCurrentRequest,
	Pointer,
	type AccessContext,
	type AccessDecisionInput,
	type AccessRoleReference,
	type AccessRoleResolver,
	type QueryTerminalOptions,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { resolveStoredRoleMembership } from './role-membership.js'
import { getRoleReferenceState, type RoleReference } from './role-reference.js'
import {
	resolveRoleReferenceId,
	RoleReferenceResolutionError,
} from './role-resolution.js'
import {
	getRoleSchemaDeclaration,
	type RoleSchemaDeclaration,
} from './role-schema.js'

const masterOptions: QueryTerminalOptions = Object.freeze({
	useMasterKey: true,
})

/** Represents one compact decision compatible with every native Access level. */
export type RoleAccessDecision = (
	input: AccessDecisionInput,
) => Promise<boolean>

/**
 * Creates one native Access decision backed by the application's neutral role provider.
 *
 * The helper captures no application or request. At execution it requires the
 * neutral service, so a missing provider fails before business hooks or storage.
 *
 * @example `update: hasRole(AppRole.role("editor"))`
 */
export const hasRole = (role: AccessRoleReference): RoleAccessDecision => {
	const candidate: unknown = role

	if (
		!(candidate instanceof AccessSubjectReference) ||
		candidate.kind !== 'role'
	) {
		throw new TypeError('hasRole requires an Access role reference')
	}

	return async ({ context }): Promise<boolean> =>
		getCurrentApplication()
			.getService(accessRoleResolverServiceToken)
			.hasRole({ context, role })
}

/** Supplies storage work behind an injectable boundary for deterministic tests. */
export interface StoredRoleResolverDependencies {
	getRequestCacheKey(context: AccessContext): object
	resolveMembership(
		schema: SchemaDefinition,
		declaration: RoleSchemaDeclaration,
		context: AccessContext,
	): Promise<readonly string[] | undefined>
	resolveReferenceId(reference: RoleReference): Promise<string | undefined>
}

interface RoleDomainRequestCache {
	readonly membership: Promise<readonly string[] | undefined>
	readonly references: Map<string, Promise<string | undefined>>
}

const createDefaultDependencies = (): StoredRoleResolverDependencies => ({
	getRequestCacheKey(context) {
		if (getCurrentRequest() !== context) {
			throw new TypeError(
				'Role Access context must match the active request context',
			)
		}

		return getCurrentEngine()
	},
	async resolveMembership(schema, declaration, context) {
		if (declaration.resolveCurrent === undefined) {
			return undefined
		}

		const member: unknown = await declaration.resolveCurrent({ context })

		if (member === undefined) {
			return undefined
		}

		if (!Pointer.is(member) || member.schema !== declaration.memberSchema) {
			throw new TypeError(
				'Role current-member resolver must return a Pointer from members.schema',
			)
		}

		return (await resolveStoredRoleMembership(schema, member)).allRoleIds
	},
	async resolveReferenceId(reference) {
		try {
			return await resolveRoleReferenceId(reference, masterOptions)
		} catch (error: unknown) {
			if (
				error instanceof RoleReferenceResolutionError &&
				error.code === 'ROLE_REFERENCE_UNKNOWN'
			) {
				return undefined
			}

			throw error
		}
	},
})

/** Creates one application-isolated neutral resolver for discovered role domains. */
export const createStoredRoleResolver = (
	roleSchemas: readonly SchemaDefinition[],
	dependencies: StoredRoleResolverDependencies = createDefaultDependencies(),
): AccessRoleResolver => {
	const registeredSchemas = new Set(roleSchemas)
	const requestCaches = new WeakMap<
		object,
		Map<SchemaDefinition, RoleDomainRequestCache>
	>()

	return immutableRecord({
		async hasRole({ context, role }): Promise<boolean> {
			const state = getRoleReferenceState(role)

			if (state === undefined || !registeredSchemas.has(state.schema)) {
				return false
			}

			const requestCacheKey = dependencies.getRequestCacheKey(context)
			let domains = requestCaches.get(requestCacheKey)

			if (domains === undefined) {
				domains = new Map()
				requestCaches.set(requestCacheKey, domains)
			}

			let domain = domains.get(state.schema)

			if (domain === undefined) {
				const declaration = getRoleSchemaDeclaration(state.schema)

				if (declaration === undefined) {
					return false
				}

				domain = {
					membership: dependencies.resolveMembership(
						state.schema,
						declaration,
						context,
					),
					references: new Map(),
				}
				domains.set(state.schema, domain)
			}

			const membership = await domain.membership

			if (membership === undefined) {
				return false
			}

			const referenceKey = role.value
			let roleId = domain.references.get(referenceKey)

			if (roleId === undefined) {
				roleId = dependencies.resolveReferenceId(role as RoleReference)
				domain.references.set(referenceKey, roleId)
			}

			const resolvedRoleId = await roleId

			return resolvedRoleId !== undefined && membership.includes(resolvedRoleId)
		},
	})
}
