import {
	definePlugin,
	extensionHandlerKey,
	type FrameworkPlugin,
	type SchemaDefinition,
} from '@ultimabase/core'

import {
	getRoleSchemaDeclaration,
	rolesPluginName,
	roleSchemaExtensionName,
} from './role-schema.js'

/** Exposes the application-local role domains discovered during setup. */
export interface RolesPluginExports {
	readonly schemas: readonly SchemaDefinition[]
}

/** Represents the option-light official stored-role provider. */
export type RolesPlugin = FrameworkPlugin<
	typeof rolesPluginName,
	RolesPluginExports,
	undefined,
	undefined,
	undefined,
	undefined,
	never
>

/**
 * Discovers every registered `RoleSchema` and claims its private extension.
 *
 * Schema fields, hooks, Access, indexes, and transports stay in their native
 * declarations rather than becoming plugin options.
 */
export const rolesPlugin = (): RolesPlugin =>
	definePlugin({
		name: rolesPluginName,
		setup: ({ registries, schemas }) => {
			registries.extensions.register(
				extensionHandlerKey('schema', roleSchemaExtensionName),
				getRoleSchemaDeclaration,
			)

			const roleSchemas = schemas
				.values()
				.filter((schema) => getRoleSchemaDeclaration(schema) !== undefined)

			return Object.freeze({ schemas: Object.freeze(roleSchemas) })
		},
	})
