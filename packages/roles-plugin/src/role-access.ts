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
	type OperationOptions,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { resolveStoredRoleMembership } from './role-membership.js'
import {
	createRoleReference,
	getRoleReferenceState,
	restoreRoleReferenceState,
	type RoleReference,
	type RoleReferenceState,
} from './role-reference.js'
import {
	resolveRoleReferenceId,
	RoleReferenceResolutionError,
} from './role-resolution.js'
import {
	getRoleSchemaDeclaration,
	type RoleSchemaDeclaration,
} from './role-schema.js'

const masterOptions: OperationOptions = Object.freeze({
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
	membership: Promise<readonly string[] | undefined> | undefined
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
	/** Reuses one membership snapshot across every role lookup in a request domain. */
	const getDomain = (
		context: AccessContext,
		schema: SchemaDefinition,
	): RoleDomainRequestCache | undefined => {
		const declaration = getRoleSchemaDeclaration(schema)

		if (declaration === undefined) return undefined

		const requestCacheKey = dependencies.getRequestCacheKey(context)
		let domains = requestCaches.get(requestCacheKey)

		if (domains === undefined) {
			domains = new Map()
			requestCaches.set(requestCacheKey, domains)
		}

		let domain = domains.get(schema)

		if (domain === undefined) {
			domain = {
				membership: undefined,
				references: new Map(),
			}
			domains.set(schema, domain)
		}

		return domain
	}
	const resolveMembership = (
		context: AccessContext,
		schema: SchemaDefinition,
		domain: RoleDomainRequestCache,
	): Promise<readonly string[] | undefined> => {
		if (domain.membership !== undefined) return domain.membership

		const declaration = getRoleSchemaDeclaration(schema)

		if (declaration === undefined) return Promise.resolve(undefined)

		// Membership remains lazy because persistence needs role identity, not a principal.
		domain.membership = dependencies.resolveMembership(
			schema,
			declaration,
			context,
		)
		return domain.membership
	}
	const resolveReferenceState = (
		role: AccessRoleReference,
	): RoleReferenceState | undefined => {
		const state =
			getRoleReferenceState(role) ??
			restoreRoleReferenceState(role, registeredSchemas)

		return state !== undefined && registeredSchemas.has(state.schema)
			? state
			: undefined
	}
	const resolveReferenceId = (
		role: AccessRoleReference,
		state: RoleReferenceState,
		domain: RoleDomainRequestCache,
	): Promise<string | undefined> => {
		let roleId = domain.references.get(role.value)

		if (roleId === undefined) {
			// Rehydrate a package-owned reference after ACL JSON removed WeakMap identity.
			roleId = dependencies.resolveReferenceId(
				createRoleReference(state.schema, state.selector),
			)
			domain.references.set(role.value, roleId)
		}

		return roleId
	}

	return immutableRecord({
		async hasRole({ context, role }): Promise<boolean> {
			const state = resolveReferenceState(role)

			if (state === undefined) return false

			const domain = getDomain(context, state.schema)

			if (domain === undefined) return false

			const membership = await resolveMembership(context, state.schema, domain)

			if (membership === undefined) return false

			const resolvedRoleId = await resolveReferenceId(role, state, domain)

			return resolvedRoleId !== undefined && membership.includes(resolvedRoleId)
		},
		async resolvePersistentRole({ context, role }) {
			const state = resolveReferenceState(role)

			if (state === undefined) return undefined

			const domain = getDomain(context, state.schema)

			if (domain === undefined) return undefined

			const id = await resolveReferenceId(role, state, domain)

			return id === undefined
				? undefined
				: createRoleReference(state.schema, { id })
		},
		async resolveCurrentRoles({ context }) {
			const references: AccessRoleReference[] = []

			for (const schema of roleSchemas) {
				const domain = getDomain(context, schema)

				if (domain === undefined) continue

				const membership = await resolveMembership(context, schema, domain)

				for (const roleId of membership ?? []) {
					references.push(createRoleReference(schema, { id: roleId }))
				}
			}

			return immutableArray(references)
		},
	})
}
