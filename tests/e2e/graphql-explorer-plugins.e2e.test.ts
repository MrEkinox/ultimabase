import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'
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
	it('rejects explorer route collisions before any request can dispatch', async () => {
		const ultimabase = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'collision' }),
			graphqlHttpProvider(),
			graphiqlPlugin({ environment: 'development', path: '/explorer' }),
			apolloSandboxPlugin({
				environment: 'development',
				path: '/explorer',
			}),
		))({ logger: false, schemas: [] })

		await expect(ultimabase.start()).rejects.toThrow('HTTP endpoint collision')
		await ultimabase.dispose()
	})

	it('rejects foreign explorer routes across sequential applications', async () => {
		const firstConsumer = httpConsumer()
		const first = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'first' }),
			graphqlHttpProvider(),
			graphiqlPlugin({ environment: 'development' }),
			firstConsumer,
		))({ logger: false, schemas: [] })
		const secondConsumer = httpConsumer()
		const second = new (UltimaBase.use(
			databasePlugin(),
			httpPlugin({ appId: 'second' }),
			graphqlHttpProvider(),
			apolloSandboxPlugin({ environment: 'development' }),
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
		['GraphiQL', () => graphiqlPlugin({ environment: 'development' })],
		['Apollo Sandbox', () => apolloSandboxPlugin()],
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
					graphiqlPlugin({ environment: 'production' }),
				))({ logger: false, schemas: [] }),
		).not.toThrow()
	})
})
