import {
	plugin,
	contributeApplication,
	requireCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'
import {
	httpApplicationCapability,
	type HttpApplication,
} from '@ultimabase/http-plugin'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

export const graphqlYogaFixtureDatabasePlugin: PluginDefinition =
	testDatabasePlugin(
		new ScriptedTestDatabase({ description: 'GraphQL Yoga fixture' }),
		{ id: 'fixture.graphql-yoga-database' },
	)

const httpApplicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

export const graphqlYogaFixtureHttpConsumer: PluginDefinition = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-http-consumer',
	version: '1.0.0',
	contributions: [
		httpApplicationRequirement,
		contributeApplication(({ capabilities }) => ({
			exports: {
				http: capabilities.get(httpApplicationRequirement),
			},
		})),
	],
})

const isHttpApplication = (value: unknown): value is HttpApplication =>
	typeof value === 'object' &&
	value !== null &&
	typeof Reflect.get(value, 'appId') === 'string' &&
	typeof Reflect.get(value, 'fetch') === 'function' &&
	typeof Reflect.get(value, 'protocolVersion') === 'string' &&
	typeof Reflect.get(value, 'routeGraph') === 'object'

export const readFixtureHttpApplication = (
	application: Readonly<{
		plugin(pluginId: 'fixture.graphql-yoga-http-consumer'): unknown
	}>,
): HttpApplication => {
	const value = application.plugin('fixture.graphql-yoga-http-consumer')
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('GraphQL Yoga HTTP fixture is unavailable')
	}
	const http: unknown = Reflect.get(value, 'http')
	if (!isHttpApplication(http)) {
		throw new TypeError('GraphQL Yoga HTTP application is unavailable')
	}
	return http
}
