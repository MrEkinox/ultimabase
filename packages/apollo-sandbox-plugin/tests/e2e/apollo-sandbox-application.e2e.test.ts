import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import {
	browserRequest,
	databasePlugin,
	graphqlHttpProvider,
	httpConsumer,
	readHttpApplication,
} from '../../../../tests/fixtures/graphql-explorer.js'
import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

// Preserve the original public-export scenarios under their contract owner.
describe('packed Apollo Sandbox plugin', () => {
	it('enables production only through an explicit override', async () => {
		const enabledConsumer = httpConsumer()
		const enabled = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'production-enabled' }),
			graphqlHttpProvider(),
			apolloSandboxPlugin({
				allowInProduction: true,
				environment: 'production',
			}),
			enabledConsumer,
		))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		await enabled.start()
		const enabledHttp = readHttpApplication(
			enabled.plugin('fixture.explorer-http-consumer'),
		)
		const response = await enabledHttp.fetch(
			browserRequest('production-enabled', '/apollo-sandbox'),
		)
		expect(response.status).toBe(200)
		expect(await response.text()).toContain('endpointIsEditable:false')
		await enabled.dispose()
	})
})
