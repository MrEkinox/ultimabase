import type { PluginDefinition } from '@ultimabase/core/plugin'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

/** Creates the inert adapter required to start a request-execution test fixture. */
export const httpTestDatabasePlugin = (
	checkHealth: () => Promise<void> = () => Promise.resolve(),
): PluginDefinition =>
	testDatabasePlugin(
		new ScriptedTestDatabase({
			checkHealth,
			description: 'HTTP test adapter',
			result: [],
		}),
		{ contributionId: 'empty-http-test-adapter', id: 'fixture.http-database' },
	)
