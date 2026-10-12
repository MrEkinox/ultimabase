import { authPlugin } from '@ultimabase/auth-plugin'
import {
	databaseAdapterCapability,
	registerPrivateStorageAdapter,
	UltimaBase,
	type DatabaseAdapter,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { password } from './password.js'

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
		checkHealth: (): Promise<void> => Promise.resolve(),
		beginTransaction: () => Promise.resolve(transaction),
		execute: unavailable,
	}
	registerPrivateStorageAdapter(adapter, {
		configurePrivateStorage: () => undefined,
		executePrivateStorage: unavailable,
	})
	return plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'conformance-database',
				create: () => ({ value: adapter }),
			}),
		],
		core: '^0.0.0',
		id: 'fixture.auth-database',
		version: '1.0.0',
	})
}

it('conforms to public plugin kernel contracts with the password method', async () => {
	const report = await runPluginConformance(
		definePluginConformanceSuite({
			createFixture: () => {
				const subject = authPlugin({ methods: [password()] })
				// The subject owns the User its factory declares (ADR-0326).
				const User = UltimaBase.use(subject).UserSchema.define({
					className: 'ConformanceUser',
				})
				return createPluginConformanceFixture({
					schemas: [User],
					subject,
					supportPlugins: [createDatabaseSupport()],
				})
			},
			expected: {
				core: '^0.0.0',
				environment: ['environment:native-code'],
				pluginId: '@ultimabase/auth-plugin',
				privileges: [
					'schema:declare',
					'storage:private',
					'operation:declare',
					'runtime:intercept',
					'transport:expose',
					'authority:elevate',
				],
				version: '0.0.0',
			},
		}),
	)

	expect(report.checks.map(({ contract }) => contract)).toContain(
		'capability-contracts',
	)
})
