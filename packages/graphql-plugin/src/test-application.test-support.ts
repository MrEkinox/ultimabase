import {
	databaseAdapterCapability,
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

class GraphqlFixtureDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	// Relations let request validation reach relation connections; no query runs.
	readonly capabilities = {
		inclusions: databaseInclusionCapability,
		persistencePlans: databasePersistencePlanCapability,
		pointers: databasePointerCapability,
		relations: databaseRelationCapability,
		relationPredicates: databaseRelationPredicateCapability,
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

export const graphqlFixtureDatabasePlugin = plugin({
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
