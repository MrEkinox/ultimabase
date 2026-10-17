import {
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import { apiServer } from './preset.js'

const database: DatabaseAdapter = {
	kind: 'database-adapter',
	capabilities: { persistencePlans: databasePersistencePlanCapability },
	checkHealth: () => Promise.resolve(),
	execute: () => Promise.reject(new TypeError('Preset fixture does not read')),
	beginTransaction: (): Promise<DatabaseTransactionAdapter> =>
		Promise.reject(new TypeError('Preset fixture does not write')),
}
const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.api-server-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: database }),
		}),
	],
})

const ids = (
	plugins: readonly {
		readonly manifest: { readonly identity: { readonly pluginId: string } }
	}[],
): readonly string[] =>
	plugins.map(({ manifest }) => manifest.identity.pluginId)

describe('apiServer (ADR-0325)', () => {
	it('returns the plugin list its options select, in order', () => {
		expect(ids(apiServer())).toStrictEqual([
			'@ultimabase/http-plugin',
			'@ultimabase/hono-server-plugin',
		])
		expect(ids(apiServer({ graphql: true, rest: true }))).toStrictEqual([
			'@ultimabase/http-plugin',
			'@ultimabase/rest-plugin',
			'@ultimabase/graphql-plugin',
			'@ultimabase/graphql-yoga-plugin',
			'@ultimabase/hono-server-plugin',
		])
		expect(
			ids(
				apiServer({
					graphql: { explorer: 'apollo-sandbox' },
					rest: false,
					server: false,
				}),
			),
		).toStrictEqual([
			'@ultimabase/http-plugin',
			'@ultimabase/graphql-plugin',
			'@ultimabase/graphql-yoga-plugin',
			'@ultimabase/graphql-explorer-plugin',
		])
		expect(Object.isFrozen(apiServer())).toBe(true)
	})

	it('forwards each option object to its plugin', async () => {
		const application = new (UltimaBase.use(
			databasePlugin,
			apiServer({
				graphql: {
					default: false,
					explorer: { environment: 'development', path: '/ide' },
					yoga: { path: '/gql' },
				},
				http: { appId: 'preset' },
				rest: { basePath: '/v2' },
				server: false,
			}),
		))({ logger: false, schemas: [] })
		onTestFinished(() => application.dispose())
		await application.start()

		expect(application.plugin('@ultimabase/rest-plugin').basePath).toBe('/v2')
		const http = application.plugin('@ultimabase/http-plugin')
		expect(http.appId).toBe('preset')
		const explorer = await http.fetch(
			new Request('http://localhost/ide', { method: 'GET' }),
		)
		expect(explorer.status).toBe(200)
		expect(await explorer.text()).toContain('const endpoint="/gql"')
		// `default: false` reached the GraphQL plugin: only `health` remains.
		expect(
			Object.keys(
				application
					.plugin('@ultimabase/graphql-plugin')
					.schema.getQueryType()
					?.getFields() ?? {},
			),
		).toStrictEqual(['health'])
	})

	it('rejects an explorer in production unless allowed, like the plugin', () => {
		const [, , , explorer] = apiServer({
			graphql: { explorer: { environment: 'production' } },
			server: false,
		})
		expect(explorer.manifest.capabilities.provides).toStrictEqual([])
	})
})
