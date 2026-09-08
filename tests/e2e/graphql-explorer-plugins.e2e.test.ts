import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'
import {
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	requireCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PluginDefinition,
} from '@ultimabase/core'
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import {
	httpApplicationCapability,
	httpApplicationProtocolVersion,
	dispatchHttpBrowserRequest,
	httpOriginalHeaderMode,
	httpPlugin,
	HttpApplicationMountTable,
	type HttpApplication,
	type HttpBrowserPolicy,
	type HttpServerRequest,
} from '@ultimabase/http-plugin'
import { describe, expect, it } from 'vitest'

class ExplorerFixtureDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.reject(new TypeError('Explorer fixture does not query'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Explorer fixture does not mutate'))
	}
}

const databasePlugin = (): PluginDefinition =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.explorer-database',
		version: '1.0.0',
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => ({ value: new ExplorerFixtureDatabase() }),
				}),
			],
		},
	})

const graphqlHttpProvider = (): PluginDefinition =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.graphql-http-provider',
		version: '1.0.0',
		capabilities: {
			provides: [
				provideCapability(graphqlHttpEndpointCapability, {
					contributionId: 'endpoint',
					create: () => ({ value: { path: '/custom-graphql' } }),
				}),
			],
		},
	})

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

const httpConsumer = () =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.explorer-http-consumer',
		version: '1.0.0',
		capabilities: { requires: [applicationRequirement] },
		setup: ({ capabilities }) => ({
			http: capabilities.get(applicationRequirement),
		}),
	})

const readHttpApplication = (value: unknown): HttpApplication => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Explorer HTTP fixture is unavailable')
	}
	const http: unknown = Reflect.get(value, 'http')
	if (
		typeof http !== 'object' ||
		http === null ||
		typeof Reflect.get(http, 'appId') !== 'string' ||
		typeof Reflect.get(http, 'fetch') !== 'function' ||
		typeof Reflect.get(http, 'routeGraph') !== 'object'
	) {
		throw new TypeError('Explorer HTTP application is unavailable')
	}
	return http as HttpApplication
}

const browserRequest = (
	appId: string,
	path: string,
	headers: readonly (readonly [string, string])[] = [],
): HttpServerRequest => {
	const fetchHeaders = new Headers()
	for (const [name, value] of headers) fetchHeaders.append(name, value)
	return {
		originalHeaders: headers,
		request: new Request(
			`http://localhost/__ultimabase/apps/${encodeURIComponent(appId)}${path}`,
			{ headers: fetchHeaders },
		),
	}
}

const mountHttpApplication = (
	application: HttpApplication,
): HttpApplicationMountTable =>
	new HttpApplicationMountTable({
		applicationProtocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		ownership: 'external',
	}).mount(application)

describe('packed GraphQL explorer plugins', () => {
	it('materializes GraphiQL through a provider-neutral endpoint and cleans up', async () => {
		const consumer = httpConsumer()
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'notes-public-id' }),
				graphqlHttpProvider(),
				graphiqlPlugin({ environment: 'development' }),
				consumer,
			],
			schemas: [],
		})
		await ultimabase.start()
		const http = readHttpApplication(
			ultimabase.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const table = mountHttpApplication(http)
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
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'browser-policy' }),
				graphqlHttpProvider(),
				graphiqlPlugin({ environment: 'development' }),
				consumer,
			],
			schemas: [],
		})
		await ultimabase.start()
		const http = readHttpApplication(
			ultimabase.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const table = mountHttpApplication(http)
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

	it('keeps production absent and enables only an explicit override', async () => {
		const disabledConsumer = httpConsumer()
		const disabled = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'production-disabled' }),
				graphqlHttpProvider(),
				graphiqlPlugin({ environment: 'production' }),
				disabledConsumer,
			],
			schemas: [],
		})
		await disabled.start()
		const disabledHttp = readHttpApplication(
			disabled.application.getPlugin('fixture.explorer-http-consumer'),
		)
		expect(
			(
				await mountHttpApplication(disabledHttp).fetch(
					browserRequest('production-disabled', '/graphiql'),
				)
			).status,
		).toBe(401)
		await disabled.dispose()

		const enabledConsumer = httpConsumer()
		const enabled = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				databasePlugin(),
				httpPlugin({ appId: 'production-enabled' }),
				graphqlHttpProvider(),
				apolloSandboxPlugin({
					allowInProduction: true,
					environment: 'production',
				}),
				enabledConsumer,
			],
			schemas: [],
		})
		await enabled.start()
		const enabledHttp = readHttpApplication(
			enabled.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const response = await mountHttpApplication(enabledHttp).fetch(
			browserRequest('production-enabled', '/apollo-sandbox'),
		)
		expect(response.status).toBe(200)
		expect(await response.text()).toContain('endpointIsEditable:false')
		await enabled.dispose()
	})

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

	it('cannot switch explorers across two mounted applications', async () => {
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
		await Promise.all([first.start(), second.start()])
		const firstHttp = readHttpApplication(
			first.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const secondHttp = readHttpApplication(
			second.application.getPlugin('fixture.explorer-http-consumer'),
		)
		const table = mountHttpApplication(firstHttp).mount(secondHttp)

		expect(
			(await table.fetch(browserRequest('first', '/apollo-sandbox'))).status,
		).toBe(401)
		expect(
			(await table.fetch(browserRequest('second', '/apollo-sandbox'))).status,
		).toBe(200)
		expect(
			(await table.fetch(browserRequest('second', '/graphiql'))).status,
		).toBe(401)
		await Promise.all([first.dispose(), second.dispose()])
	})
})
