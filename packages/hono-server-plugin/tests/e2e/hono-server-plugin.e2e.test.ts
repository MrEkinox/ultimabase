import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { Hono } from 'hono'
import { expect, it } from 'vitest'

it('loads the packed Hono provider with its private implementation dependency', () => {
	const plugin = honoServerPlugin({
		app: new Hono(),
		browserPolicyOwner: 'ultimabase',
	})
	expect(plugin.manifest).toMatchObject({
		environment: ['environment:network'],
		identity: { pluginId: '@ultimabase/hono-server-plugin' },
		privileges: [],
	})
})
