import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { postgresPlugin } from './postgres-plugin.js'

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

it('conforms to the public plugin kernel contracts without opening PostgreSQL', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [],
					subject: postgresPlugin({ pool: new ConformancePool() }),
				}),
			expected: {
				core: '^0.0.0',
				environment: ['environment:network'],
				pluginId: '@ultimabase/postgres-plugin',
				privileges: ['adapter:consume'],
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain(
		'lifecycle-cleanup',
	)
})
