import {
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
} from '@ultimabase/core'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

export const graphqlFixtureDatabasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({
		// Relations let request validation reach relation connections; no query runs.
		capabilities: {
			inclusions: databaseInclusionCapability,
			persistencePlans: databasePersistencePlanCapability,
			pointers: databasePointerCapability,
			relations: databaseRelationCapability,
			relationPredicates: databaseRelationPredicateCapability,
		},
		description: 'GraphQL fixture',
	}),
	{ id: 'fixture.graphql-database' },
)
