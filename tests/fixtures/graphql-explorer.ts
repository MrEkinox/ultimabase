import {
	plugin,
	contributeApplication,
	provideCapability,
	requireCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'

import {
	graphqlHttpEndpointCapability,
	graphqlIntrospectionCapability,
} from '@ultimabase/graphql-http'

import {
	httpApplicationCapability,
	type HttpApplication,
	type HttpServerRequest,
} from '@ultimabase/http-plugin'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../tooling/vitest/test-database.js'
// Share provider-neutral infrastructure without importing either explorer.

export const databasePlugin = (): PluginDefinition =>
	testDatabasePlugin(
		new ScriptedTestDatabase({ description: 'Explorer fixture' }),
		{ id: 'fixture.explorer-database' },
	)

/** Publishes the endpoint and, unless disabled, introspection (ADR-0312). */
export const graphqlHttpProvider = ({
	introspection = true,
}: { readonly introspection?: boolean } = {}): PluginDefinition =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-http-provider',
		version: '1.0.0',
		contributions: [
			provideCapability(graphqlHttpEndpointCapability, {
				contributionId: 'endpoint',
				create: () => ({ value: { path: '/custom-graphql' } }),
			}),
			...(introspection
				? [
						provideCapability(graphqlIntrospectionCapability, {
							contributionId: 'introspection',
							create: () => ({ value: { path: '/custom-graphql' } }),
						}),
					]
				: []),
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
