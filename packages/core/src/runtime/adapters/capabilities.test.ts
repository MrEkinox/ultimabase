import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import {
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import {
	contributeApplication,
	withPluginPrivileges,
} from '../../plugins/plugin-contributions.js'
import {
	adapterPhysicalSchemaCapability,
	adapterPersistencePlanCapability,
	adapterConstraintCapability,
	adapterSupport,
	adapterValueStorageCapability,
	provideAdapterCapability,
} from './capabilities.js'
import {
	defineAdapterContributionCapability,
	materializeAdapterContribution,
	provideAdapterContribution,
} from './contributions.js'

const constraintSupport = adapterSupport({
	adapterId: 'fixture.database',
	family: 'constraint' as const,
	protocolVersion: 1 as const,
})

describe('adapter capabilities', () => {
	it('validates support families and contribution payload boundaries', () => {
		expect(() =>
			provideAdapterCapability(adapterConstraintCapability, {
				contributionId: 'invalid-support',
				// @ts-expect-error -- Runtime validation protects untyped support facts.
				value: 'fixture.database',
			}),
		).toThrow('adapter support must be a plain object')
		expect(() =>
			adapterSupport({
				adapterId: 'unqualified',
				family: 'physical-schema',
				protocolVersion: 1,
			}),
		).toThrow('namespaced adapter identifier')
		expect(() =>
			provideAdapterCapability(adapterValueStorageCapability, {
				contributionId: 'invalid-formats',
				value: {
					adapterId: 'fixture.database',
					family: 'value-storage',
					// @ts-expect-error -- Runtime validation protects untyped support facts.
					formats: ['text'],
				},
			}),
		).toThrow('formats must contain json')
		expect(() =>
			provideAdapterCapability(adapterPhysicalSchemaCapability, {
				contributionId: 'invalid-version',
				value: {
					adapterId: 'fixture.database',
					family: 'physical-schema',
					// @ts-expect-error -- Runtime validation protects protocol facts.
					protocolVersion: 2,
				},
			}),
		).toThrow('protocolVersion must be 1')
		expect(() =>
			provideAdapterCapability(adapterConstraintCapability, {
				contributionId: 'invalid-family',
				value: {
					adapterId: 'fixture.database',
					// @ts-expect-error -- Runtime validation protects capability families.
					family: 'physical-schema',
					protocolVersion: 1,
				},
			}),
		).toThrow('adapter support family must be constraint')
		expect(() =>
			provideAdapterCapability(adapterPersistencePlanCapability, {
				contributionId: 'invalid-kinds',
				value: {
					adapterId: 'fixture.database',
					family: 'persistence-plan',
					// @ts-expect-error -- Runtime validation protects persistence facts.
					kinds: 'update-one',
					protocolVersion: 1,
				},
			}),
		).toThrow('kinds must be an array')

		expect(() =>
			defineAdapterContributionCapability<{ readonly value: string }>()({
				adapterId: 'fixture.database',
				capabilityId: 'fixture.invalid-family',
				// @ts-expect-error -- Runtime validation protects untyped family metadata.
				family: 'migration',
				version: '1.0.0',
			}),
		).toThrow('family must be physical-schema')
		const physical = defineAdapterContributionCapability<
			Readonly<{ readonly column: string }>
		>()({
			adapterId: 'fixture.database',
			capabilityId: 'fixture.validated-physical',
			family: 'physical-schema',
			version: '1.0.0',
		})
		expect(() =>
			provideAdapterContribution(physical, {
				contributionId: 'invalid-protocol',
				payload: { column: 'state' },
				protocolVersion: 0,
			}),
		).toThrow('protocolVersion must be a positive safe integer')
		expect(() =>
			provideAdapterContribution(physical, {
				contributionId: 'invalid-payload',
				// @ts-expect-error -- Runtime validation rejects executable metadata.
				payload: { column: () => 'state' },
				protocolVersion: 1,
			}),
		).toThrow('must be a JSON value')
		expect(() =>
			materializeAdapterContribution(physical, 'invalid', {
				contributionId: 'invalid',
				owner: { pluginId: 'fixture.owner' },
				packageVersion: '1.0.0',
			}),
		).toThrow('provider returned an invalid value')
	})

	it('uses a dedicated missing-capability diagnostic before initialization', () => {
		const requirement = requireCapability(adapterConstraintCapability, '^1.0.0')
		const consumer = createPlugin({
			core: '^0.0.0',
			id: 'fixture.adapter-consumer',
			permissions: { 'adapter:consume': 'Requires constraint support.' },
			version: '1.0.0',
			contributions: [requirement],
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [consumer],
					schemas: [],
				}),
		).toThrow(
			expect.objectContaining({ code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING' }),
		)
	})

	it('requires adapter consumption authority and the exact provider factory', () => {
		const requirement = requireCapability(adapterConstraintCapability, '^1.0.0')
		expect(() =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.adapter-unauthorized',
				version: '1.0.0',
				contributions: [requirement],
			}),
		).toThrow('Missing plugin permission reason: adapter:consume')

		const forgedProvider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.adapter-forged',
			permissions: { 'adapter:consume': 'Exercises exact provider facades.' },
			version: '1.0.0',
			contributions: [
				withPluginPrivileges(
					provideCapability(adapterConstraintCapability, {
						contributionId: 'forged',
						value: constraintSupport,
					}),
					['adapter:consume'],
				),
			],
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [forgedProvider],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
	})

	it('injects exact physical owner provenance and enforces adapter privilege', async () => {
		const physicalCapability = defineAdapterContributionCapability<
			Readonly<{ readonly kind: 'column' }>
		>()({
			adapterId: 'fixture.database',
			capabilityId: 'fixture.database-physical',
			family: 'physical-schema',
			version: '1.0.0',
		})
		const requirement = requireCapability(physicalCapability, '^1.0.0')
		const contribution = provideAdapterContribution(physicalCapability, {
			contributionId: 'column',
			normalizedStaticOptions: immutableRecord({ mode: 'safe' }),
			payload: immutableRecord({ kind: 'column' as const }),
			protocolVersion: 3,
		})
		expect(() =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.database-bridge-unauthorized',
				version: '2.0.0',
				contributions: [contribution],
			}),
		).toThrow('Missing plugin permission reason: adapter:consume')
		const provider = createPlugin({
			core: '^0.0.0',
			instanceId: 'primary',
			id: 'fixture.database-bridge',
			permissions: {
				'adapter:consume': 'Contributes physical schema metadata.',
			},
			version: '2.0.0',
			contributions: [contribution],
		})
		const consumer = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-adapter',
			permissions: { 'adapter:consume': 'Compiles physical metadata.' },
			version: '1.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => ({
					exports: capabilities.get(requirement),
				})),
			],
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [provider, consumer],
			schemas: [],
		})

		await application.initialize()
		expect(application.getPlugin('fixture.database-adapter')).toStrictEqual([
			{
				adapterId: 'fixture.database',
				contributionId: 'column',
				family: 'physical-schema',
				instanceId: 'primary',
				normalizedStaticOptions: { mode: 'safe' },
				packageVersion: '2.0.0',
				payload: { kind: 'column' },
				pluginId: 'fixture.database-bridge',
				protocolVersion: 3,
			},
		])
		await application.dispose()
	})

	it('rejects an incompatible adapter bridge protocol before initialization', () => {
		const versionOne = defineAdapterContributionCapability<
			Readonly<{ readonly column: string }>
		>()({
			adapterId: 'fixture.database',
			capabilityId: 'fixture.database-physical-protocol',
			family: 'physical-schema',
			version: '1.0.0',
		})
		const versionTwo = defineAdapterContributionCapability<
			Readonly<{ readonly column: string }>
		>()({
			adapterId: 'fixture.database',
			capabilityId: 'fixture.database-physical-protocol',
			family: 'physical-schema',
			version: '2.0.0',
		})
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-physical-v1',
			permissions: { 'adapter:consume': 'Provides physical metadata.' },
			version: '1.0.0',
			contributions: [
				provideAdapterContribution(versionOne, {
					contributionId: 'column',
					payload: { column: 'state' },
					protocolVersion: 1,
				}),
			],
		})
		const consumer = createPlugin({
			core: '^0.0.0',
			id: 'fixture.database-physical-v2-consumer',
			permissions: { 'adapter:consume': 'Consumes physical metadata.' },
			version: '1.0.0',
			contributions: [requireCapability(versionTwo, '^2.0.0')],
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [provider, consumer],
					schemas: [],
				}),
		).toThrow(
			expect.objectContaining({ code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING' }),
		)
	})
})
