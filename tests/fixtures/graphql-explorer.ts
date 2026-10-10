import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	plugin,
	contributeApplication,
	provideCapability,
	requireCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PluginDefinition,
} from '@ultimabase/core'

import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'

import {
	httpApplicationCapability,
	type HttpApplication,
	type HttpServerRequest,
} from '@ultimabase/http-plugin'
// Share provider-neutral infrastructure without importing either explorer.

class ExplorerFixtureDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
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

export const databasePlugin = (): PluginDefinition =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.explorer-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new ExplorerFixtureDatabase() }),
			}),
		],
	})

export const graphqlHttpProvider = (): PluginDefinition =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-http-provider',
		version: '1.0.0',
		contributions: [
			provideCapability(graphqlHttpEndpointCapability, {
				contributionId: 'endpoint',
				create: () => ({ value: { path: '/custom-graphql' } }),
			}),
		],
	})

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

export const httpConsumer = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.explorer-http-consumer',
		version: '1.0.0',
		contributions: [
			applicationRequirement,
			contributeApplication(({ capabilities }) => ({
				exports: { http: capabilities.get(applicationRequirement) },
			})),
		],
	})

export const readHttpApplication = (value: unknown): HttpApplication => {
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

export const browserRequest = (
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
