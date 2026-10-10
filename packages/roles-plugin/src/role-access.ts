import {
	RequestSubjectReference,
	getCurrentEngine,
	getCurrentRequest,
	getRequestPrincipal,
	Pointer,
	requireCurrentRequestRoleResolver,
	type PolicyPredicate,
	type RequestRoleReference,
	type RequestRoleResolver,
	type RequestSubjectContext,
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

/**
 * Returns a policy predicate (ADR-0304) that holds when the current request's
 * member belongs to `role`, directly or through included roles. Access, ACL
 * and other policy plugins accept it wherever a rule returns a decision.
 *
 * The predicate captures no application or request. At execution it requires
 * the application-local `requestRoleResolverCapability`, so a missing provider
 * raises `PLUGIN_CAPABILITY_MISSING` before business hooks or storage.
 *
 * @example `update: hasRole(AppRole.role("editor"))`
 */
export const hasRole = (role: RequestRoleReference): PolicyPredicate => {
	const candidate: unknown = role

	if (
		!(candidate instanceof RequestSubjectReference) ||
		candidate.kind !== 'role'
	) {
		throw new TypeError('hasRole requires an Access role reference')
	}

	const predicate: PolicyPredicate = async (): Promise<boolean> =>
		requireCurrentRequestRoleResolver().hasRole({
			// Role providers receive the original request, not a derived hook view.
			context: getCurrentRequest(),
			role,
		})
	// Startup logs name predicates: `hasRole(TodoRole editor)`.
	const state = getRoleReferenceState(role)
	const selector =
		state === undefined
			? undefined
			: 'name' in state.selector
				? state.selector.name
				: state.selector.id
	Object.defineProperty(predicate, 'name', {
		value:
			state === undefined
				? 'hasRole'
				: `hasRole(${state.schema.className} ${String(selector)})`,
	})
	return predicate
}

/** Supplies storage work behind an injectable boundary for deterministic tests. */
export interface StoredRoleResolverDependencies {
	getRequestCacheKey(context: RequestSubjectContext): object
	resolveMembership(
		schema: SchemaDefinition,
		declaration: RoleSchemaDeclaration,
		context: RequestSubjectContext,
	): Promise<readonly string[] | undefined>
	resolveReferenceId(reference: RoleReference): Promise<string | undefined>
}

/** Holds one request's lazy membership snapshot and reference ids for one domain. */
interface RoleDomainRequestCache {
	readonly declaration: RoleSchemaDeclaration
	membership?: Promise<readonly string[] | undefined>
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
		// The Core principal is the current member when it belongs to the member
		// schema; `resolveCurrent` remains for special cases (ADR-0304).
		const member: unknown =
			declaration.resolveCurrent === undefined
				? await getRequestPrincipal(getCurrentRequest())
				: await declaration.resolveCurrent({ context })
		if (
			declaration.resolveCurrent === undefined &&
			Pointer.is(member) &&
			member.schema !== declaration.memberSchema
		) {
			return undefined
		}

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
): RequestRoleResolver => {
	const registeredSchemas = new Set(roleSchemas)
	const requestCaches = new WeakMap<
		object,
		Map<SchemaDefinition, RoleDomainRequestCache>
	>()
	/** Reuses one membership snapshot across every role lookup in a request domain. */
	const getDomain = (
		context: RequestSubjectContext,
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
			domain = { declaration, references: new Map() }
			domains.set(schema, domain)
		}

		return domain
	}
	// Membership remains lazy because persistence needs role identity, not a principal.
	const resolveMembership = (
		context: RequestSubjectContext,
		schema: SchemaDefinition,
		domain: RoleDomainRequestCache,
	): Promise<readonly string[] | undefined> =>
		(domain.membership ??= dependencies.resolveMembership(
			schema,
			domain.declaration,
			context,
		))
	const resolveReferenceState = (
		role: RequestRoleReference,
	): RoleReferenceState | undefined => {
		const state =
			getRoleReferenceState(role) ??
			restoreRoleReferenceState(role, registeredSchemas)

		return state !== undefined && registeredSchemas.has(state.schema)
			? state
			: undefined
	}
	const resolveReferenceId = (
		role: RequestRoleReference,
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
			const domain =
				state === undefined ? undefined : getDomain(context, state.schema)

			if (state === undefined || domain === undefined) return false

			const membership = await resolveMembership(context, state.schema, domain)

			if (membership === undefined) return false

			const resolvedRoleId = await resolveReferenceId(role, state, domain)

			return resolvedRoleId !== undefined && membership.includes(resolvedRoleId)
		},
		async resolvePersistentRole({ context, role }) {
			const state = resolveReferenceState(role)
			const domain =
				state === undefined ? undefined : getDomain(context, state.schema)

			if (state === undefined || domain === undefined) return undefined

			const id = await resolveReferenceId(role, state, domain)

			return id === undefined
				? undefined
				: createRoleReference(state.schema, { id })
		},
		async resolveCurrentRoles({ context }) {
			const references: RequestRoleReference[] = []

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
