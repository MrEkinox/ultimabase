import {
	databaseAdapterCapability,
	definePlugin,
	provideCapability,
	registerPrivateStorageAdapter,
	type DatabaseAdapter,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { passwordAuthPlugin } from './plugin.js'

const unavailable = (): Promise<never> =>
	Promise.reject(new TypeError('Conformance adapter does not execute requests'))

const createDatabaseSupport = () => {
	const transaction: DatabaseTransactionAdapter = {
		kind: 'database-transaction-adapter',
		commit: () => Promise.resolve(),
		execute: unavailable,
		prepare: unavailable,
		rollback: () => Promise.resolve(),
	}
	const adapter: DatabaseAdapter = {
		kind: 'database-adapter',
		beginTransaction: () => Promise.resolve(transaction),
		execute: unavailable,
	}
	registerPrivateStorageAdapter(adapter, {
		configurePrivateStorage: () => undefined,
		executePrivateStorage: unavailable,
	})
	return definePlugin({
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'conformance-database',
					create: () => ({ value: adapter }),
				}),
			],
		},
		core: '^0.0.0',
		pluginId: 'fixture.password-auth-database',
		version: '1.0.0',
	})
}

it('conforms to public plugin kernel contracts', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					subject: passwordAuthPlugin(),
					supportPlugins: [createDatabaseSupport()],
				}),
			expected: {
				core: '^0.0.0',
				environment: ['environment:native-code'],
				pluginId: '@ultimabase/password-auth-plugin',
				privileges: ['schema:declare', 'storage:private', 'runtime:intercept'],
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain(
		'capability-contracts',
	)
})
