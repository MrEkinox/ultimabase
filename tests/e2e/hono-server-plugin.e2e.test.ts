import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { Hono } from 'hono'
import { expect, it } from 'vitest'

it('loads the packed Hono provider with its private implementation dependency', () => {
	const plugin = honoServerPlugin({ app: new Hono() })
	expect(plugin.manifest).toMatchObject({
		environment: ['environment:network'],
		identity: { pluginId: '@ultimabase/server-hono-plugin' },
		privileges: [],
	})
})
