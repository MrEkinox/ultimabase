import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it, onTestFinished } from 'vitest'

import { defineOperation, defineOperationValue } from '@ultimabase/core/plugin'

import { apiServer } from './preset.js'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

const databasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({ description: 'Preset fixture' }),
	{ id: 'fixture.api-server-database' },
)

const nullValue = defineOperationValue((value: unknown): null => {
	if (value !== null) throw new TypeError('Expected null')
	return null
})
const presetOperation = defineOperation({
	input: nullValue,
	name: 'fixture.api-server.operation',
	result: nullValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
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

	// ADR-0347 decision 3: shared options reach every installed transport.
	it('forwards the shared exposure options to REST and GraphQL', () => {
		const invalid = { pagination: { maxTake: 0 } }
		expect(() => apiServer({ ...invalid, rest: true })).toThrow(
			'REST plugin pagination.maxTake must be a positive safe integer',
		)
		expect(() => apiServer({ ...invalid, graphql: true })).toThrow(
			'GraphQL plugin pagination',
		)
		const repeated = { hide: [presetOperation, presetOperation] }
		expect(() => apiServer({ ...repeated, rest: true })).toThrow(
			'REST plugin hide repeats fixture.api-server.operation',
		)
		expect(() => apiServer({ ...repeated, graphql: true })).toThrow(
			'GraphQL plugin hide repeats fixture.api-server.operation',
		)
		// Nothing reads them without a transport.
		expect(() => apiServer({ ...invalid, ...repeated })).not.toThrow()
	})

	it('forwards publicWrites to both transports', async () => {
		const Entry = UltimaBase.Schema.define({
			className: 'PresetEntry',
			fields: (field) => ({ title: field.string() }),
		})
		const rest = new (UltimaBase.use(
			databasePlugin,
			apiServer({ rest: true, server: false }),
		))({ logger: false, schemas: [Entry] })
		await expect(rest.start()).rejects.toThrow('REST exposes writes')
		await rest.dispose()

		const graphql = new (UltimaBase.use(
			databasePlugin,
			apiServer({ graphql: true, server: false }),
		))({ logger: false, schemas: [Entry] })
		await expect(graphql.start()).rejects.toThrow('GraphQL exposes writes')
		await graphql.dispose()

		const open = new (UltimaBase.use(
			databasePlugin,
			apiServer({
				graphql: true,
				publicWrites: true,
				rest: true,
				server: false,
			}),
		))({ logger: false, schemas: [Entry] })
		onTestFinished(() => open.dispose())
		// Starts: both transports received `publicWrites`.
		await open.start()
	})

	it('lets a transport section replace a shared option wholesale', async () => {
		expect(() =>
			apiServer({
				pagination: { maxTake: 0 },
				graphql: { pagination: { maxTake: 200 } },
				rest: { pagination: { maxTake: 200 } },
			}),
		).not.toThrow()
		const application = new (UltimaBase.use(
			databasePlugin,
			apiServer({
				pagination: { defaultTake: 20, maxTake: 100 },
				rest: { pagination: { maxTake: 500 } },
				server: false,
			}),
		))({ logger: false, schemas: [] })
		await application.start()
		// No deep merge: `defaultTake` falls back to REST's own default.
		expect(
			application.plugin('@ultimabase/rest-plugin').readLimits,
		).toMatchObject({ defaultTake: 100, maxTake: 500 })
		await application.dispose()

		const shared = new (UltimaBase.use(
			databasePlugin,
			apiServer({
				pagination: { defaultTake: 20, maxTake: 100 },
				rest: true,
				server: false,
			}),
		))({ logger: false, schemas: [] })
		onTestFinished(() => shared.dispose())
		await shared.start()
		expect(shared.plugin('@ultimabase/rest-plugin').readLimits).toMatchObject({
			defaultTake: 20,
			maxTake: 100,
		})
	})

	// ADR-0347 amendment item 4: the shared default reaches both transports.
	it('forwards the shared default to REST and GraphQL', async () => {
		const Entry = UltimaBase.Schema.define({
			className: 'PresetDefaultEntry',
			fields: (field) => ({ title: field.string() }),
		})
		const start = async (options: Parameters<typeof apiServer>[0]) => {
			const application = new (UltimaBase.use(
				databasePlugin,
				apiServer({
					graphql: true,
					publicWrites: true,
					rest: true,
					server: false,
					...options,
				}),
			))({ logger: false, schemas: [Entry] })
			// One application per realm: each start disposes before the next.
			try {
				await application.start()
				return {
					queries: Object.keys(
						application
							.plugin('@ultimabase/graphql-plugin')
							.schema.getQueryType()
							?.getFields() ?? {},
					),
					routes: application
						.plugin('@ultimabase/rest-plugin')
						.routeGraph.routes.map((route) => `${route.method} ${route.path}`),
				}
			} finally {
				await application.dispose()
			}
		}

		const shared = await start({ default: { count: true } })
		expect(shared.routes).toContain('GET /api/classes/PresetDefaultEntry/count')
		expect(shared.queries).toContain('countPresetDefaultEntry')

		// A transport's own default replaces the shared one as a whole.
		const replaced = await start({
			default: { count: true },
			graphql: { default: false },
		})
		expect(replaced.routes).toContain(
			'GET /api/classes/PresetDefaultEntry/count',
		)
		expect(replaced.queries).toStrictEqual(['health'])
	})

	// ADR-0347 decision 1: one expose rule applies to every transport.
	it('applies one expose rule to REST and GraphQL alike', async () => {
		const Entry = UltimaBase.Schema.define({
			className: 'PresetExposedEntry',
			fields: (field) => ({ title: field.string() }),
		}).with({ expose: { count: true, write: false } })
		const application = new (UltimaBase.use(
			databasePlugin,
			apiServer({ graphql: true, rest: true, server: false }),
		))({ logger: false, schemas: [Entry] })
		onTestFinished(() => application.dispose())
		// Starts without publicWrites: neither transport exposes a write.
		await application.start()
		const routes = application
			.plugin('@ultimabase/rest-plugin')
			.routeGraph.routes.map((route) => `${route.method} ${route.path}`)
			.filter((route) => route.includes('PresetExposedEntry'))
		expect(routes).toContain('GET /api/classes/PresetExposedEntry/count')
		for (const write of [
			'POST /api/classes/PresetExposedEntry',
			'PATCH /api/classes/PresetExposedEntry/{id}',
			'DELETE /api/classes/PresetExposedEntry/{id}',
		]) {
			expect(routes).not.toContain(write)
		}
		const graphql = application.plugin('@ultimabase/graphql-plugin').schema
		expect(Object.keys(graphql.getQueryType()?.getFields() ?? {})).toContain(
			'countPresetExposedEntry',
		)
		expect(graphql.getMutationType()).toBeUndefined()
	})

	it('rejects an explorer in production unless allowed, like the plugin', () => {
		const [, , , explorer] = apiServer({
			graphql: { explorer: { environment: 'production' } },
			server: false,
		})
		expect(explorer.manifest.capabilities.provides).toStrictEqual([])
	})
})
