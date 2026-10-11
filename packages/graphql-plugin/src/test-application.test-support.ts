import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'

class GraphqlFixtureDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.reject(new TypeError('GraphQL fixture does not query'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('GraphQL fixture does not mutate'))
	}
}

export const graphqlFixtureDatabasePlugin: PluginDefinition = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new GraphqlFixtureDatabase() }),
		}),
	],
})
