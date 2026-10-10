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
	type PluginConformanceExpected,
	type PluginConformanceReport,
} from './contracts.js'
import {
	createPluginConformanceFixture,
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
	{ manifest }: PluginDefinition,
	expected: PluginConformanceExpected,
): void => {
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

const assertCapabilities = ({ manifest }: PluginDefinition): void => {
	for (const name of ['provides', 'requires', 'optional'] as const) {
		const declarations = manifest.capabilities[name]
		assertFrozen(declarations, `capabilities.${name}`)
		for (const declaration of declarations) {
			assertFrozen(declaration, `capabilities.${name} declaration`)
			assertFrozen(declaration.token, `capabilities.${name} token`)
		}
	}
}

/**
 * Creates one unstarted application through Core's sole installation path,
 * `UltimaBase.use()`, with the startup logger silenced.
 */
const createUltimaBase = <TSchemas extends readonly SchemaDefinition[]>(
	plugins: readonly PluginDefinition[],
	schemas: TSchemas,
) =>
	new (UltimaBase.use(...plugins))({
		logger: false,
		schemas,
	})

type Disposable = Readonly<{ dispose(): Promise<void> }>

/** Disposes every application after `use`, including after a failed assertion. */
const disposeAfter = async (
	applications: readonly Disposable[],
	use: () => unknown,
): Promise<void> => {
	try {
		await use()
	} finally {
		await Promise.all(applications.map((application) => application.dispose()))
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
		const application = new (UltimaBase.use(...fixture.plugins))({
			pluginPrivileges: {
				plugins: { [identity.pluginId]: pluginPolicy },
			},
			logger: false,
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

	const { expected } = suite
	const checks: PluginConformanceReport['checks'][number][] = []
	const run = async (
		contract: PluginConformanceContract,
		verify: () => Promise<void> | void,
	): Promise<void> => {
		try {
			await verify()
			checks.push(immutableRecord({ contract, status: 'passed' as const }))
		} catch (cause: unknown) {
			throw new PluginConformanceError(contract, expected.pluginId, cause)
		}
	}
	// Re-snapshots every fixture: untyped JavaScript factories may return any value.
	const freshFixture = (): PluginConformanceFixture<
		TSubject,
		TSupport,
		TSchemas
	> => {
		const fixture = suite.createFixture()
		return createPluginConformanceFixture({
			schemas: fixture.schemas,
			subject: fixture.subject,
			supportPlugins: fixture.supportPlugins,
		})
	}
	const freshApplication = () => {
		const fixture = freshFixture()
		return createUltimaBase(fixture.plugins, fixture.schemas)
	}

	await run('manifest', () => {
		assertManifest(freshFixture().subject, expected)
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
					expected.pluginId,
					'instance plugin ID',
				)
				assertEqual(
					plugin.manifest.identity.instanceId,
					instanceId,
					'instance ID',
				)
				assertEqual(
					plugin.manifest.version,
					expected.version,
					'instance version',
				)
			}
			const application = createUltimaBase(
				[...fixture.supportPlugins, first, second],
				fixture.schemas,
			)
			await disposeAfter([application], async () => {
				const installed = application.pluginPrivilegeReport.plugins.filter(
					({ identity }) => identity.pluginId === expected.pluginId,
				)
				assertEqual(
					installed.map(({ identity }) => identity.instanceId),
					[firstId, secondId],
					'configured plugin instances',
				)
				await application.initialize()
			})
		})
	}

	const privilegeFixture = freshFixture()
	if (privilegeFixture.subject.manifest.privileges.length > 0) {
		await run('privilege-denial', () => {
			const { plugins, schemas, subject } = privilegeFixture
			const application = createUltimaBase(plugins, schemas)
			return disposeAfter([application], async () => {
				const identity = subject.manifest.identity
				const report = application.pluginPrivilegeReport.plugins.find(
					(plugin) =>
						plugin.identity.pluginId === identity.pluginId &&
						plugin.identity.instanceId === identity.instanceId,
				)
				if (report === undefined) {
					throw new TypeError(
						'Subject plugin is absent from the privilege report',
					)
				}
				const requested = report.privileges.map(({ name }) => name)
				if (requested.length > 0) {
					await assertDenied(privilegeFixture, { deny: requested })
				}
			})
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

	await run('capability-contracts', () => {
		const fixture = freshFixture()
		assertCapabilities(fixture.subject)
		const application = createUltimaBase(fixture.plugins, fixture.schemas)
		return disposeAfter([application], () => application.initialize())
	})
	await run('static-determinism', () => {
		const firstFixture = freshFixture()
		const secondFixture = freshFixture()
		const first = createUltimaBase(firstFixture.plugins, firstFixture.schemas)
		const second = createUltimaBase(
			secondFixture.plugins,
			secondFixture.schemas,
		)
		return disposeAfter([first, second], () => {
			assertEqual(
				createPluginStaticConformanceSnapshot(first),
				createPluginStaticConformanceSnapshot(second),
				'plugin static graph',
			)
		})
	})
	await run('provenance', () => {
		const application = freshApplication()
		return disposeAfter([application], () => {
			assertPublicPluginProvenance(application)
		})
	})
	await run('lifecycle-cleanup', async () => {
		const application = freshApplication()
		await disposeAfter([application], () => application.initialize())
		assertEqual(application.state, 'disposed', 'application lifecycle state')
	})
	await run('application-isolation', () => {
		const first = freshApplication()
		const second = freshApplication()
		return disposeAfter([first, second], async () => {
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
		})
	})

	for (const check of suite.checks) {
		await run(check.contract, async () => {
			const created: Disposable[] = []
			const context: PluginConformanceContext<TSubject, TSupport, TSchemas> = {
				createUltimaBase: () => {
					const fixture = freshFixture()
					const ultimabase = createUltimaBase(fixture.plugins, fixture.schemas)
					created.push(ultimabase)
					return immutableRecord({ ...fixture, ultimabase })
				},
			}
			try {
				await check.verify(immutableRecord(context))
			} finally {
				// Created applications are disposed in reverse creation order.
				await Promise.all(
					created.reverse().map((application) => application.dispose()),
				)
			}
		})
	}

	return immutableRecord({
		checks: immutableArray(checks),
		pluginId: expected.pluginId,
	})
}
