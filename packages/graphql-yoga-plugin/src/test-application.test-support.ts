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
import {
	httpApplicationCapability,
	type HttpApplication,
} from '@ultimabase/http-plugin'

class GraphqlYogaFixtureDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.reject(new TypeError('GraphQL Yoga fixture does not query'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('GraphQL Yoga fixture does not mutate'))
	}
}

export const graphqlYogaFixtureDatabasePlugin: PluginDefinition = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new GraphqlYogaFixtureDatabase() }),
		}),
	],
})

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
		getPlugin(pluginId: 'fixture.graphql-yoga-http-consumer'): unknown
	}>,
): HttpApplication => {
	const value = application.getPlugin('fixture.graphql-yoga-http-consumer')
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('GraphQL Yoga HTTP fixture is unavailable')
	}
	const http: unknown = Reflect.get(value, 'http')
	if (!isHttpApplication(http)) {
		throw new TypeError('GraphQL Yoga HTTP application is unavailable')
	}
	return http
}
