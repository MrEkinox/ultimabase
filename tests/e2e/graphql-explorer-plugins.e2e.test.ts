import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import {
	browserRequest,
	databasePlugin,
	graphqlHttpProvider,
	httpConsumer,
	mountHttpApplication,
	readHttpApplication,
} from '../fixtures/graphql-explorer.js'
import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

// Preserve the original public-export scenarios under their contract owner.
describe('packed GraphQL explorer composition', () => {
	it('rejects explorer route collisions before any request can dispatch', async () => {
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'collision' }),
				graphqlHttpProvider(),
				graphiqlPlugin({ environment: 'development', path: '/explorer' }),
				apolloSandboxPlugin({
					environment: 'development',
					path: '/explorer',
				}),
			],
			schemas: [],
		})

		await expect(ultimabase.start()).rejects.toThrow('HTTP endpoint collision')
		await ultimabase.dispose()
	})

	it('rejects foreign explorer routes across sequential applications', async () => {
		const firstConsumer = httpConsumer()
		const first = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'first' }),
				graphqlHttpProvider(),
				graphiqlPlugin({ environment: 'development' }),
				firstConsumer,
			],
			schemas: [],
		})
		const secondConsumer = httpConsumer()
		const second = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'second' }),
				graphqlHttpProvider(),
				apolloSandboxPlugin({ environment: 'development' }),
				secondConsumer,
			],
			schemas: [],
		})
		await first.start()
		const firstHttp = readHttpApplication(
			first.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const table = mountHttpApplication(firstHttp)

		expect(
			(await table.fetch(browserRequest('first', '/apollo-sandbox'))).status,
		).toBe(401)
		await first.dispose()
		await second.start()
		const secondHttp = readHttpApplication(
			second.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const secondTable = mountHttpApplication(secondHttp)

		expect(
			(await secondTable.fetch(browserRequest('second', '/apollo-sandbox')))
				.status,
		).toBe(200)
		expect(
			(await secondTable.fetch(browserRequest('second', '/graphiql'))).status,
		).toBe(401)
		await Promise.all([first.dispose(), second.dispose()])
	})
})
