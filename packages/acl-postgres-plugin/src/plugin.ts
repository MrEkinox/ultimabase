import { aclPluginName } from '@ultimabase/acl-permissions-plugin'
import { definePlugin, type FrameworkPlugin } from '@ultimabase/core'
import { postgresPluginName } from '@ultimabase/postgres-plugin'

import {
	aclPostgresConstraintCompiler,
	aclReferencePostgresConstraintCompiler,
} from './acl-constraint.js'

/** Identifies the optional PostgreSQL integration for persisted ACL constraints. */
export const aclPostgresPluginName = 'ultimabase.acl-postgres' as const

/** Represents the stateless ACL/PostgreSQL integration plugin. */
export type ACLPostgresPlugin = FrameworkPlugin<
	typeof aclPostgresPluginName,
	undefined,
	readonly [typeof aclPluginName, typeof postgresPluginName]
>

/** Registers ACL's opaque row constraint with the selected PostgreSQL adapter. */
export const aclPostgresPlugin = (): ACLPostgresPlugin =>
	definePlugin({
		dependencies: [aclPluginName, postgresPluginName],
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: aclPostgresPluginName,
		setup: ({ constraintCompilers }) => {
			constraintCompilers.register(aclPostgresConstraintCompiler)
			constraintCompilers.register(aclReferencePostgresConstraintCompiler)

			return undefined
		},
	})
