import {
	requestRoleResolverCapability,
	type CompiledSchemaRegistry,
	type Logger,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	provideCapability,
	type CapabilityProviderDeclaration,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import {
	createStoredRoleResolver,
	type StoredRoleResolver,
} from './role-access.js'
import { ensureRoles } from './role-ensure.js'
import { createRoleQueries, type RolesPluginExports } from './role-queries.js'
import { registerRoleSchemas } from './role-resolution.js'
import {
	getRoleSchemaDeclaration,
	type RoleSchemaDeclaration,
} from './role-schema.js'

/** Pairs one discovered role schema with its package-private declaration. */
export interface RoleDomain {
	readonly declaration: RoleSchemaDeclaration
	readonly schema: SchemaDefinition
}

/** Discovers role schemas only through the identity recorded by `App.RoleSchema.define()`. */
export const readRoleDomains = (
	schemas: CompiledSchemaRegistry,
): readonly RoleDomain[] =>
	schemas.values().flatMap((schema) => {
		const declaration = getRoleSchemaDeclaration(schema)

		return declaration === undefined ? [] : [{ declaration, schema }]
	})

/** One application's resolver and its query exports, shared by setup and `start()`. */
interface RoleApplicationState {
	readonly queries: RolesPluginExports
	readonly resolver: StoredRoleResolver
}

const roleStatesBySchemas = new WeakMap<object, RoleApplicationState>()

export const readRoleState = (schemas: object): RoleApplicationState => {
	const state = roleStatesBySchemas.get(schemas)
	if (state === undefined) {
		throw new TypeError('Roles plugin is not initialized for this application')
	}
	return state
}

export const roleResolverProvider: CapabilityProviderDeclaration<
	typeof requestRoleResolverCapability
> = provideCapability(requestRoleResolverCapability, {
	contributionId: 'stored-roles',
	create: ({ callbacks, owner, schemas }) => {
		const roleSchemas = readRoleDomains(schemas).map(({ schema }) => schema)
		registerRoleSchemas(roleSchemas)
		const resolver = createStoredRoleResolver(roleSchemas)
		roleStatesBySchemas.set(
			schemas,
			immutableRecord({
				resolver,
				// Exports run application code paths; their Master reads stay attributed to Roles.
				queries: createRoleQueries(
					() => resolver,
					new Set(roleSchemas),
					(work) => callbacks.runPlugin(owner, work),
				),
			}),
		)
		const { hasRole, resolveCurrentRoles, resolvePersistentRole } = resolver
		return {
			value: immutableRecord({
				hasRole,
				resolveCurrentRoles,
				resolvePersistentRole,
			}),
		}
	},
})

export const ensureAllRoles = async (
	schemas: CompiledSchemaRegistry,
	logger: Logger,
): Promise<void> => {
	for (const { declaration, schema } of readRoleDomains(schemas)) {
		if (declaration.ensure.length === 0) continue
		let created: readonly string[]
		try {
			created = await ensureRoles(schema, declaration.ensure)
		} catch (error: unknown) {
			// Roles elevates with its own privilege: name the declaration that failed.
			throw new TypeError(
				`Roles could not create the ensure roles of ${schema.className} (they are created with Roles' authority:elevate privilege; the cause names the failing write)`,
				{ cause: error },
			)
		}
		if (created.length > 0) {
			logger.info(`created ${schema.className} roles: ${created.join(', ')}`)
		}
	}
}
