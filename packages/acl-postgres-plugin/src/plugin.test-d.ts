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
		readonly ['ultimabase.acl', '@ultimabase/postgres-plugin'] | undefined
	>()
})
