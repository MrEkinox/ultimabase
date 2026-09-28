import {
	FrameworkError,
	UltimaBase,
	type PluginDefinition,
	type PluginEnvironmentClaim,
	type PluginPrivilege,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	PluginConformanceError,
	type PluginConformanceContract,
	type PluginConformanceReport,
} from './contracts.js'
import {
	normalizePluginConformanceFixture,
	type PluginConformanceFixture,
} from './fixture.js'
import {
	assertPublicPluginProvenance,
	createPluginStaticConformanceSnapshot,
} from './static-snapshot.js'
import {
	PluginConformanceSuite,
	type PluginConformanceContext,
} from './suite.js'

const assertEqual = (
	actual: unknown,
	expected: unknown,
	label: string,
): void => {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new TypeError(`${label} does not match the expected public contract`)
	}
}

const assertFrozen = (value: object, label: string): void => {
	if (!Object.isFrozen(value)) throw new TypeError(`${label} must be immutable`)
}

const assertManifest = (
	plugin: PluginDefinition,
	expected: PluginConformanceSuite<
		PluginDefinition,
		readonly PluginDefinition[],
		readonly SchemaDefinition[]
	>['expected'],
): void => {
	const { manifest } = plugin
	assertEqual(manifest.identity.pluginId, expected.pluginId, 'plugin ID')
	assertEqual(manifest.version, expected.version, 'plugin version')
	assertEqual(manifest.core, expected.core, 'Core compatibility range')
	assertFrozen(manifest, 'plugin manifest')
	assertFrozen(manifest.identity, 'plugin identity')
	assertFrozen(manifest.privileges, 'plugin privileges')
	assertFrozen(manifest.environment, 'plugin environmental claims')
	assertFrozen(manifest.capabilities, 'plugin capabilities')

	for (const request of manifest.privileges) {
		if (request.reason.trim().length === 0) {
			throw new TypeError(`Privilege "${request.name}" needs a reason`)
		}
	}
	if (expected.privileges !== undefined) {
		assertEqual(
			manifest.privileges.map(({ name }) => name),
			expected.privileges,
			'plugin privileges',
		)
	}
	if (expected.environment !== undefined) {
		assertEqual(
			manifest.environment,
			expected.environment,
			'plugin environmental claims',
		)
	}
}

const assertCapabilities = (plugin: PluginDefinition): void => {
	const capabilities = plugin.manifest.capabilities
	const groups: readonly Readonly<{
		readonly name: string
		readonly declarations: readonly Readonly<{ readonly token: object }>[]
	}>[] = [
		{ declarations: capabilities.provides, name: 'provides' },
		{ declarations: capabilities.requires, name: 'requires' },
		{ declarations: capabilities.optional, name: 'optional' },
	]
	for (const { declarations, name } of groups) {
		assertFrozen(declarations, `capabilities.${name}`)
		for (const declaration of declarations) {
			assertFrozen(declaration, `capabilities.${name} declaration`)
			assertFrozen(declaration.token, `capabilities.${name} token`)
		}
	}
}

const assertDenied = async (
	fixture: PluginConformanceFixture,
	denial: Readonly<{
		readonly deny?: readonly PluginPrivilege[]
		readonly denyClaims?: readonly PluginEnvironmentClaim[]
	}>,
): Promise<void> => {
	const identity = fixture.subject.manifest.identity
	const pluginPolicy =
		identity.instanceId === undefined
			? denial
			: { instances: { [identity.instanceId]: denial } }
	try {
		const application = new UltimaBase({
			pluginPrivileges: {
				logger: false,
				plugins: { [identity.pluginId]: pluginPolicy },
			},
			plugins: fixture.plugins,
			schemas: fixture.schemas,
		})
		await application.dispose()
	} catch (error: unknown) {
		if (
			error instanceof FrameworkError &&
			error.code === 'PLUGIN_PRIVILEGE_DENIED'
		) {
			return
		}
		throw error
	}
	throw new TypeError('Core accepted a plugin policy that should be denied')
}

type Disposable = Readonly<{ dispose(): Promise<void> }>

const createUltimaBase = <
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
>(
	fixture: PluginConformanceFixture<TSubject, TSupport, TSchemas>,
) =>
	new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: fixture.plugins,
		schemas: fixture.schemas,
	})

/**
 * Runs every common and selected plugin invariant through public package APIs.
 * Failures identify one exact contract and retain the original error as `cause`.
 *
 * @example
 * ```ts
 * const report = await runPluginConformance(suite)
 * expect(report.checks).toContainEqual({ contract: 'manifest', status: 'passed' })
 * ```
 */
export const runPluginConformance = async <
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
>(
	suite: PluginConformanceSuite<TSubject, TSupport, TSchemas>,
): Promise<PluginConformanceReport> => {
	if (!(suite instanceof PluginConformanceSuite)) {
		throw new TypeError('runPluginConformance expects a conformance suite')
	}

	const checks: PluginConformanceReport['checks'][number][] = []
	const run = async (
		contract: PluginConformanceContract,
		verify: () => Promise<void> | void,
	): Promise<void> => {
		try {
			await verify()
			checks.push(immutableRecord({ contract, status: 'passed' as const }))
		} catch (cause: unknown) {
			throw new PluginConformanceError(contract, suite.expected.pluginId, cause)
		}
	}
	const freshFixture = (): PluginConformanceFixture<
		TSubject,
		TSupport,
		TSchemas
	> => normalizePluginConformanceFixture(suite.createFixture())

	await run('manifest', () => {
		assertManifest(freshFixture().subject, suite.expected)
	})

	const instances = suite.instances
	if (instances !== undefined) {
		await run('instance-identity', async () => {
			const fixture = freshFixture()
			const [firstId, secondId] = instances.instanceIds
			const first = instances.create(firstId)
			const second = instances.create(secondId)
			for (const [plugin, instanceId] of [
				[first, firstId],
				[second, secondId],
			] as const) {
				assertEqual(
					plugin.manifest.identity.pluginId,
					suite.expected.pluginId,
					'instance plugin ID',
				)
				assertEqual(
					plugin.manifest.identity.instanceId,
					instanceId,
					'instance ID',
				)
				assertEqual(
					plugin.manifest.version,
					suite.expected.version,
					'instance version',
				)
			}
			const application = new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [...fixture.supportPlugins, first, second],
				schemas: fixture.schemas,
			})
			try {
				const installed = application.pluginPrivilegeReport.plugins.filter(
					({ identity }) => identity.pluginId === suite.expected.pluginId,
				)
				assertEqual(
					installed.map(({ identity }) => identity.instanceId),
					[firstId, secondId],
					'configured plugin instances',
				)
				await application.initialize()
			} finally {
				await application.dispose()
			}
		})
	}

	const privilegeFixture = freshFixture()
	if (privilegeFixture.subject.manifest.privileges.length > 0) {
		await run('privilege-denial', async () => {
			const application = createUltimaBase(privilegeFixture)
			const identity = privilegeFixture.subject.manifest.identity
			try {
				const subject = application.pluginPrivilegeReport.plugins.find(
					(plugin) =>
						plugin.identity.pluginId === identity.pluginId &&
						plugin.identity.instanceId === identity.instanceId,
				)
				if (subject === undefined) {
					throw new TypeError(
						'Subject plugin is absent from the privilege report',
					)
				}
				const active = subject.privileges
					.filter(({ active }) => active)
					.map(({ name }) => name)
				if (active.length > 0) {
					await assertDenied(privilegeFixture, { deny: active })
				}
			} finally {
				await application.dispose()
			}
		})
	}
	const environmentFixture = freshFixture()
	if (environmentFixture.subject.manifest.environment.length > 0) {
		await run('environment-claim-denial', () =>
			assertDenied(environmentFixture, {
				denyClaims: environmentFixture.subject.manifest.environment,
			}),
		)
	}

	await run('capability-contracts', async () => {
		const fixture = freshFixture()
		assertCapabilities(fixture.subject)
		const application = createUltimaBase(fixture)
		try {
			await application.initialize()
		} finally {
			await application.dispose()
		}
	})
	await run('static-determinism', async () => {
		const first = freshFixture()
		const second = freshFixture()
		const firstApplication = createUltimaBase(first)
		const secondApplication = createUltimaBase(second)
		try {
			assertEqual(
				createPluginStaticConformanceSnapshot(firstApplication),
				createPluginStaticConformanceSnapshot(secondApplication),
				'plugin static graph',
			)
		} finally {
			await Promise.all([
				firstApplication.dispose(),
				secondApplication.dispose(),
			])
		}
	})
	await run('provenance', async () => {
		const application = createUltimaBase(freshFixture())
		try {
			assertPublicPluginProvenance(application)
		} finally {
			await application.dispose()
		}
	})
	await run('lifecycle-cleanup', async () => {
		const application = createUltimaBase(freshFixture())
		try {
			await application.initialize()
		} finally {
			await application.dispose()
		}
		assertEqual(application.state, 'disposed', 'application lifecycle state')
	})
	await run('application-isolation', async () => {
		const first = createUltimaBase(freshFixture())
		const second = createUltimaBase(freshFixture())
		try {
			await first.initialize()
			let rejected = false
			try {
				await second.initialize()
			} catch (error: unknown) {
				if (
					!(error instanceof TypeError) ||
					!error.message.includes('Another UltimaBase application is active')
				)
					throw error
				rejected = true
			}
			assertEqual(rejected, true, 'competing application activation rejection')
			assertEqual(first.state, 'ready', 'incumbent application lifecycle state')
			await first.dispose()
			await second.initialize()
			assertEqual(
				second.state,
				'ready',
				'replacement application lifecycle state',
			)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	for (const check of suite.checks) {
		await run(check.contract, async () => {
			const disposables: Disposable[] = []
			const context: PluginConformanceContext<TSubject, TSupport, TSchemas> = {
				createUltimaBase: () => {
					const fixture = freshFixture()
					const ultimabase = createUltimaBase(fixture)
					disposables.push(ultimabase)
					return immutableRecord({ ...fixture, ultimabase })
				},
			}
			try {
				await check.verify(immutableRecord(context))
			} finally {
				await Promise.all(
					disposables.reverse().map((disposable) => disposable.dispose()),
				)
			}
		})
	}

	return immutableRecord({
		checks: immutableArray(checks),
		pluginId: suite.expected.pluginId,
	})
}
