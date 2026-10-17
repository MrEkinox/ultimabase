import {
	databasePersistencePlanCapability,
	databasePluginFieldStructuralContainsCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	type DatabaseLogicalRecord,
} from '@ultimabase/core'
import type { PluginDefinition } from '@ultimabase/core/plugin'

import { testDatabaseFilterOperators } from '../../tooling/vitest/database-filter-operators.js'
import { MemoryTestDatabase } from '../../tooling/vitest/memory-database.js'
import { testDatabasePlugin } from '../../tooling/vitest/test-database.js'

/** Seeds the in-memory test database with the official conformance protocols. */
export class OfficialConformanceDatabase extends MemoryTestDatabase {
	constructor(
		rows: ReadonlyMap<string, readonly DatabaseLogicalRecord[]> = new Map(),
		trace?: string[],
	) {
		super({
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
				pluginFieldStructuralContains:
					databasePluginFieldStructuralContainsCapability,
				relationPredicates: databaseRelationPredicateCapability,
				relations: databaseRelationCapability,
			},
			rows: Object.fromEntries(rows),
			...(trace === undefined ? {} : { trace }),
		})
	}
}

/** Installs one public adapter provider with an application-local fixture. */
export const officialConformanceDatabasePlugin = (
	database: OfficialConformanceDatabase,
): PluginDefinition =>
	testDatabasePlugin(database, {
		contributionId: 'official-conformance-database',
		id: 'fixture.official-conformance-database',
	})
