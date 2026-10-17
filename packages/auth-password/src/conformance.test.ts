import { authPlugin } from '@ultimabase/auth-plugin'
import { registerPrivateStorageAdapter, UltimaBase } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { password } from './password.js'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

const createDatabaseSupport = () => {
	const adapter = new ScriptedTestDatabase({
		capabilities: {},
		description: 'Conformance adapter',
		transactions: 'empty',
	})
	registerPrivateStorageAdapter(adapter, {
		configurePrivateStorage: () => undefined,
		executePrivateStorage: () =>
			Promise.reject(
				new TypeError('Conformance adapter does not execute requests'),
			),
	})
	return testDatabasePlugin(adapter, {
		contributionId: 'conformance-database',
		id: 'fixture.auth-database',
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
