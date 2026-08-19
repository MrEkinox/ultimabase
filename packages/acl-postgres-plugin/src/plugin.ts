import { aclPluginName } from '@ultimabase/acl-permissions-plugin'
import { type FrameworkPlugin } from '@ultimabase/core'
import { definePluginModule } from '@ultimabase/plugin-kit'
import { postgresPluginName } from '@ultimabase/postgres-plugin'

import {
	aclPostgresConstraintCompiler,
	aclReferencePostgresConstraintCompiler,
} from './acl-constraint.js'

/** Identifies the optional PostgreSQL integration for persisted ACL constraints. */
export const aclPostgresPluginName = 'ultimabase.acl-postgres' as const
const aclPostgresPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: aclPostgresPluginName,
	version: '0.0.0',
})

/** Represents the stateless ACL/PostgreSQL integration plugin. */
export type ACLPostgresPlugin = FrameworkPlugin<
	typeof aclPostgresPluginName,
	undefined,
	readonly [
		Readonly<{ pluginId: typeof aclPluginName; version: '^0.0.0' }>,
		Readonly<{ pluginId: typeof postgresPluginName; version: '^0.0.0' }>,
	],
	undefined,
	undefined,
	undefined,
	undefined,
	'0.0.0',
	'^0.0.0',
	readonly [
		Readonly<{
			readonly name: 'adapter:consume'
			readonly reason: 'Compiles ACL constraints for the PostgreSQL adapter.'
		}>,
	]
>

/** Registers ACL's opaque row constraint with the selected PostgreSQL adapter. */
export const aclPostgresPlugin = (): ACLPostgresPlugin =>
	aclPostgresPluginModule.plugin({
		dependencies: [
			{ pluginId: aclPluginName, version: '^0.0.0' },
			{ pluginId: postgresPluginName, version: '^0.0.0' },
		],
		privileges: [
			{
				name: 'adapter:consume',
				reason: 'Compiles ACL constraints for the PostgreSQL adapter.',
			},
		],
		setup: ({ constraintCompilers }) => {
			constraintCompilers.register(aclPostgresConstraintCompiler)
			constraintCompilers.register(aclReferencePostgresConstraintCompiler)

			return undefined
		},
	})
