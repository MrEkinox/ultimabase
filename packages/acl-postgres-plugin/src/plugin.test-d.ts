import { expectTypeOf, test } from 'vitest'

import {
	aclPostgresPlugin,
	type aclPostgresPluginName,
	type ACLPostgresPlugin,
} from './index.js'

test('retains the exact integration identity and dependencies', () => {
	const plugin = aclPostgresPlugin()

	expectTypeOf(plugin).toEqualTypeOf<ACLPostgresPlugin>()
	expectTypeOf(plugin.manifest.identity.pluginId).toEqualTypeOf<
		typeof aclPostgresPluginName
	>()
	expectTypeOf(plugin.dependencies).toEqualTypeOf<
		| readonly [
				Readonly<{ pluginId: 'ultimabase.acl'; version: '^0.0.0' }>,
				Readonly<{
					pluginId: '@ultimabase/postgres-plugin'
					version: '^0.0.0'
				}>,
		  ]
		| undefined
	>()
})
