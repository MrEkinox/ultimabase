import {
	FrameworkError,
	Pointer,
	RequestSubjectReference,
	getCurrentRequest,
	type OperationOptions,
	type PointerValue,
	type RequestRoleReference,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { StoredRoleResolver } from './role-access.js'
import { resolveStoredRoleMembership } from './role-membership.js'
import {
	createRoleReference,
	getRoleReferenceState,
	restoreRoleReferenceState,
	type RoleReferenceState,
} from './role-reference.js'
import {
	resolveRoleReferenceId,
	RoleReferenceResolutionError,
} from './role-resolution.js'
import { getRoleSchemaDeclaration } from './role-schema.js'

/** Options of `has(role, options)`. */
export interface RoleHasOptions {
	/**
	 * Checks this member instead of the current request's.
	 * @example `has(Admin, { principal: TodoUser.pointer(userId) })`
	 */
	readonly principal: PointerValue
}

/** What `ultimabase.plugin(rolesPlugin)` returns (ADR-0322). */
export interface RolesPluginExports {
	/**
	 * Reports whether the current request's member holds `role`, directly or
	 * through included roles, with the same computation and cache as
	 * `hasRole` in rules; with `{ principal }`, checks that member instead.
	 * Without `principal`, call it inside a request (a hook, a rule, an
	 * operation handler).
	 *
	 * @example `if (await ultimabase.plugin(rolesPlugin).has(TodoRole.role('admin'))) { ... }`
	 */
	has(role: RequestRoleReference, options?: RoleHasOptions): Promise<boolean>
	/**
	 * Lists the names of the current request's roles in one role schema,
	 * included roles' memberships counted, sorted; empty for an anonymous
	 * request. Call it inside a request.
	 *
	 * @example `const names = await ultimabase.plugin(rolesPlugin).current(TodoRole)`
	 */
	current(schema: SchemaDefinition): Promise<readonly string[]>
}

const masterOptions: OperationOptions = Object.freeze({ useMasterKey: true })

/** Runs plugin-owned queries attributed to the Roles plugin. */
export type RunAsRoles = <TResult>(work: () => Promise<TResult>) => Promise<TResult>

const readReferenceState = (
	role: RequestRoleReference,
	roleSchemas: ReadonlySet<SchemaDefinition>,
): RoleReferenceState | undefined => {
	const candidate: unknown = role
	if (
		!(candidate instanceof RequestSubjectReference) ||
		candidate.kind !== 'role'
	) {
		throw new TypeError('has() requires a role reference such as Role.role(name)')
	}
	const state =
		getRoleReferenceState(role) ?? restoreRoleReferenceState(role, roleSchemas)
	return state !== undefined && roleSchemas.has(state.schema) ? state : undefined
}

const resolveReferenceIdOrUndefined = async (
	state: RoleReferenceState,
): Promise<string | undefined> => {
	if ('id' in state.selector) return state.selector.id
	try {
		// A restored state has no package reference; rebuild one by name.
		return await resolveRoleReferenceId(
			createRoleReference(state.schema, state.selector),
			masterOptions,
		)
	} catch (error: unknown) {
		if (
			error instanceof RoleReferenceResolutionError &&
			error.code === 'ROLE_REFERENCE_UNKNOWN'
		) {
			return undefined
		}
		throw error
	}
}

/** Creates the exports of one application's Roles plugin. */
export const createRoleQueries = (
	readResolver: () => StoredRoleResolver,
	roleSchemas: ReadonlySet<SchemaDefinition>,
	runAsRoles: RunAsRoles,
): RolesPluginExports =>
	immutableRecord({
		has: async (
			role: RequestRoleReference,
			options?: RoleHasOptions,
		): Promise<boolean> => {
			const state = readReferenceState(role, roleSchemas)
			if (options === undefined) {
				const context = getCurrentRequest()
				return runAsRoles(async () => readResolver().hasRole({ context, role }))
			}
			const principal: unknown = options.principal
			if (!Pointer.is(principal)) {
				throw new FrameworkError(
					'VALIDATION_ERROR',
					'has() principal must be a Pointer',
				)
			}
			const declaration =
				state === undefined
					? undefined
					: getRoleSchemaDeclaration(state.schema)
			if (
				state === undefined ||
				declaration === undefined ||
				principal.schema !== declaration.memberSchema()
			) {
				return false
			}
			return runAsRoles(async () => {
				const roleId = await resolveReferenceIdOrUndefined(state)
				if (roleId === undefined) return false
				const membership = await resolveStoredRoleMembership(
					state.schema,
					principal,
				)
				return membership.allRoleIds.includes(roleId)
			})
		},
		current: (schema: SchemaDefinition): Promise<readonly string[]> => {
			const context = getCurrentRequest()
			return runAsRoles(() =>
				readResolver().currentRoleNames(context, schema),
			)
		},
	})
