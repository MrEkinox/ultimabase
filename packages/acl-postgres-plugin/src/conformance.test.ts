import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	postgresPlugin,
	type PostgresPool,
	type PostgresPoolClient,
} from '@ultimabase/postgres-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { aclPostgresPlugin } from './plugin.js'

class ConformancePool implements PostgresPool {
	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve({
			query: () => Promise.resolve({ rows: [] }),
			release: () => undefined,
		})
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(): Promise<{ readonly rows: readonly unknown[] }> {
		return Promise.resolve({ rows: [] })
	}
}

it('conforms with its public ACL and PostgreSQL dependencies', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [],
					subject: aclPostgresPlugin(),
					supportPlugins: [
						aclPlugin(),
						postgresPlugin({ pool: new ConformancePool() }),
					],
				}),
			expected: {
				core: '^0.0.0',
				pluginId: 'ultimabase.acl-postgres',
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain(
		'privilege-denial',
	)
})
