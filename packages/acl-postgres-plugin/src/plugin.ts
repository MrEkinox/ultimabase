import { aclPluginName } from '@ultimabase/acl-permissions-plugin'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { postgresPluginName } from '@ultimabase/postgres-plugin'

import {
	aclPostgresConstraintCompiler,
	aclReferencePostgresConstraintCompiler,
} from './acl-constraint.js'

/** Identifies the optional PostgreSQL integration for persisted ACL constraints. */
export const aclPostgresPluginName = 'ultimabase.acl-postgres' as const
const aclPostgresPluginModule: PluginModule<
	typeof aclPostgresPluginName,
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: aclPostgresPluginName,
	version: '0.0.0',
})

const aclPostgresDependencies: readonly [
	Readonly<{
		readonly pluginId: typeof aclPluginName
		readonly version: '^0.0.0'
	}>,
	Readonly<{
		readonly pluginId: typeof postgresPluginName
		readonly version: '^0.0.0'
	}>,
] = [
	{ pluginId: aclPluginName, version: '^0.0.0' },
	{ pluginId: postgresPluginName, version: '^0.0.0' },
]
const aclPostgresPrivileges = [
	{
		name: 'adapter:consume',
		reason: 'Compiles ACL constraints for the PostgreSQL adapter.',
	},
] as const
type ACLPostgresPluginDefinition = Readonly<{
	readonly dependencies: typeof aclPostgresDependencies
	readonly privileges: typeof aclPostgresPrivileges
}>

/** Represents the exact stateless ACL/PostgreSQL integration plugin. */
export type ACLPostgresPlugin = PluginModuleInstance<
	typeof aclPostgresPluginModule,
	ACLPostgresPluginDefinition
>

/** Registers ACL's opaque row constraint with the selected PostgreSQL adapter. */
export const aclPostgresPlugin = (): ACLPostgresPlugin =>
	aclPostgresPluginModule.plugin({
		dependencies: aclPostgresDependencies,
		privileges: aclPostgresPrivileges,
		setup: ({ constraintCompilers }) => {
			constraintCompilers.register(aclPostgresConstraintCompiler)
			constraintCompilers.register(aclReferencePostgresConstraintCompiler)

			return undefined
		},
	})
