import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'
import {
	httpPlugin,
	dispatchHttpBrowserRequest,
	type HttpBrowserPolicy,
} from '@ultimabase/http-plugin'
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
describe('packed GraphiQL plugin', () => {
	it('materializes GraphiQL through a provider-neutral endpoint and cleans up', async () => {
		const consumer = httpConsumer()
		const ultimabase = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'notes-public-id' }),
			graphqlHttpProvider(),
			graphiqlPlugin({ environment: 'development' }),
			consumer,
		))({ logger: false, schemas: [] })
		await ultimabase.start()
		const http = readHttpApplication(
			ultimabase.plugin('fixture.explorer-http-consumer'),
		)
		const table = http
		const response = await table.fetch(
			browserRequest('notes-public-id', '/graphiql', [
				['Cookie', 'session=must-not-leak'],
			]),
		)
		const html = await response.text()

		expect(response.status).toBe(200)
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(html).toContain('const endpoint="/custom-graphql"')
		expect(html).not.toContain('notes-public-id')
		expect(html).not.toContain('must-not-leak')
		expect(http.routeGraph.browserBootstraps[0]?.provenance.owner).toEqual({
			pluginId: '@ultimabase/graphiql-plugin',
		})

		await ultimabase.dispose()
		expect(
			(await table.fetch(browserRequest('notes-public-id', '/graphiql')))
				.status,
		).toBe(500)
	})

	it('preserves the explicit browser policy on headerless bootstrap navigation', async () => {
		const consumer = httpConsumer()
		const ultimabase = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'browser-policy' }),
			graphqlHttpProvider(),
			graphiqlPlugin({ environment: 'development' }),
			consumer,
		))({ logger: false, schemas: [] })
		await ultimabase.start()
		const http = readHttpApplication(
			ultimabase.plugin('fixture.explorer-http-consumer'),
		)
		const table = http
		const input = browserRequest('browser-policy', '/graphiql', [
			['Origin', 'https://console.example'],
		])
		const policy: HttpBrowserPolicy = {
			enabled: true,
			allowedHeaders: ['X-UltimaBase-Application-Id', 'Content-Type'],
			allowedMethods: ['GET', 'POST'],
			allowedOrigins: ['https://console.example'],
			credentials: false,
			maxAgeSeconds: 600,
		}
		const response = await dispatchHttpBrowserRequest(policy, input, () =>
			table.fetch(input),
		)

		expect(response.status).toBe(200)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://console.example',
		)
		expect(response.headers.get('Vary')).toContain('Origin')
		await ultimabase.dispose()
	})

	it('keeps production absent by default', async () => {
		const disabledConsumer = httpConsumer()
		const disabled = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'production-disabled' }),
			graphqlHttpProvider(),
			graphiqlPlugin({ environment: 'production' }),
			disabledConsumer,
		))({
			logger: false,
			schemas: [],
		})
		await disabled.start()
		const disabledHttp = readHttpApplication(
			disabled.plugin('fixture.explorer-http-consumer'),
		)
		expect(
			(
				await disabledHttp.fetch(
					browserRequest('production-disabled', '/graphiql'),
				)
			).status,
		).toBe(401)
		await disabled.dispose()
	})
})
