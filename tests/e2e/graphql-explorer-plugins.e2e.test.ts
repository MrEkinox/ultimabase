import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import {
	browserRequest,
	databasePlugin,
	graphqlHttpProvider,
	httpConsumer,
	readHttpApplication,
} from '../fixtures/graphql-explorer.js'
import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

// Preserve the original public-export scenarios under their contract owner.
describe('packed GraphQL explorer composition', () => {
	it('rejects a second explorer in one application before any request can dispatch', () => {
		// One plugin id: a second explorer is a duplicate plugin (ADR-0325).
		expect(
			() =>
				new (UltimaBase.use(
					databasePlugin(),
					httpPlugin({ appId: 'collision' }),
					graphqlHttpProvider(),
					graphqlExplorerPlugin({ environment: 'development' }),
					graphqlExplorerPlugin({
						environment: 'development',
						ui: 'apollo-sandbox',
					}),
				))({ logger: false, schemas: [] }),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_DUPLICATE' }))
	})

	it('rejects foreign explorer routes across sequential applications', async () => {
		const firstConsumer = httpConsumer()
		const first = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'first' }),
			graphqlHttpProvider(),
			graphqlExplorerPlugin({ environment: 'development' }),
			firstConsumer,
		))({ logger: false, schemas: [] })
		const secondConsumer = httpConsumer()
		const second = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'second' }),
			graphqlHttpProvider(),
			graphqlExplorerPlugin({
				environment: 'development',
				ui: 'apollo-sandbox',
			}),
			secondConsumer,
		))({
			logger: false,
			schemas: [],
		})
		await first.start()
		const firstHttp = readHttpApplication(
			first.plugin('fixture.explorer-http-consumer'),
		)
		const table = firstHttp

		expect(
			(await table.fetch(browserRequest('first', '/apollo-sandbox'))).status,
		).toBe(404)
		await first.dispose()
		await second.start()
		const secondHttp = readHttpApplication(
			second.plugin('fixture.explorer-http-consumer'),
		)
		const secondTable = secondHttp

		expect(
			(await secondTable.fetch(browserRequest('second', '/apollo-sandbox')))
				.status,
		).toBe(200)
		expect(
			(await secondTable.fetch(browserRequest('second', '/graphiql'))).status,
		).toBe(404)
		await Promise.all([first.dispose(), second.dispose()])
	})

	// ADR-0312: an explorer that is served while introspection is off refuses
	// to start, and the missing capability says what to change (ADR-0313).
	it.each([
		['GraphiQL', () => graphqlExplorerPlugin({ environment: 'development' })],
		['Apollo Sandbox', () => graphqlExplorerPlugin({ ui: 'apollo-sandbox' })],
	])('refuses a served %s without introspection', (_name, explorer) => {
		for (const provider of [
			graphqlHttpProvider({ introspection: false }),
			graphqlYogaPlugin({ introspection: false }),
		]) {
			expect(
				() =>
					new (UltimaBase.use(
						databasePlugin(),
						httpPlugin({ appId: 'introspection-off' }),
						graphqlPlugin(),
						provider,
						explorer(),
					))({ logger: false, schemas: [] }),
			).toThrow(
				'requires capability "ultimabase.graphql.introspection" version "^1.0.0", but no compatible provider is installed. Enable introspection, for example graphqlYogaPlugin({ introspection: true }), or stop serving the explorer in this environment.',
			)
		}
	})

	it('accepts an explorer that production does not serve without introspection', () => {
		expect(
			() =>
				new (UltimaBase.use(
					databasePlugin(),
					httpPlugin({ appId: 'production-explorer' }),
					graphqlHttpProvider({ introspection: false }),
					graphqlExplorerPlugin({ environment: 'production' }),
				))({ logger: false, schemas: [] }),
		).not.toThrow()
	})
})
