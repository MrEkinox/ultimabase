import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import {
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import { definePlugin } from '../../plugins/definition.js'
import {
	adapterMigrationCapability,
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
				family: 'migration',
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
			provideAdapterCapability(adapterMigrationCapability, {
				contributionId: 'invalid-version',
				value: {
					adapterId: 'fixture.database',
					family: 'migration',
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
					family: 'migration',
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
				family: 'storage',
				version: '1.0.0',
			}),
		).toThrow('family must be migration or physical-schema')
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
		const consumer = definePlugin({
			capabilities: { requires: [requirement] },
			core: '^0.0.0',
			pluginId: 'fixture.adapter-consumer',
			privileges: [
				{ name: 'adapter:consume', reason: 'Requires constraint support.' },
			] as const,
			version: '1.0.0',
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
		const provider = definePlugin({
			capabilities: {
				provides: [
					provideAdapterCapability(adapterConstraintCapability, {
						contributionId: 'constraints',
						value: constraintSupport,
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.adapter-provider',
			version: '1.0.0',
		})
		const unauthorized = definePlugin({
			capabilities: { requires: [requirement] },
			core: '^0.0.0',
			pluginId: 'fixture.adapter-unauthorized',
			version: '1.0.0',
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [provider, unauthorized],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))

		const forgedProvider = definePlugin({
			capabilities: {
				provides: [
					provideCapability(adapterConstraintCapability, {
						contributionId: 'forged',
						value: constraintSupport,
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.adapter-forged',
			version: '1.0.0',
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

	it('injects exact owner provenance and enforces migration privilege separately', async () => {
		const migrationCapability = defineAdapterContributionCapability<
			Readonly<{ readonly kind: 'upgrade' }>
		>()({
			adapterId: 'fixture.database',
			capabilityId: 'fixture.database-migrations',
			family: 'migration',
			version: '1.0.0',
		})
		const requirement = requireCapability(migrationCapability, '^1.0.0')
		const contribution = provideAdapterContribution(migrationCapability, {
			contributionId: 'upgrade',
			normalizedStaticOptions: immutableRecord({ mode: 'safe' }),
			payload: immutableRecord({ kind: 'upgrade' as const }),
			protocolVersion: 3,
		})
		const unauthorizedProvider = definePlugin({
			capabilities: { provides: [contribution] },
			core: '^0.0.0',
			pluginId: 'fixture.database-bridge-unauthorized',
			version: '2.0.0',
		})
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [unauthorizedProvider],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
		const provider = definePlugin({
			capabilities: { provides: [contribution] },
			core: '^0.0.0',
			instanceId: 'primary',
			pluginId: 'fixture.database-bridge',
			privileges: [
				{
					name: 'migration:contribute',
					reason: 'Contributes explicit upgrade intent.',
				},
			] as const,
			version: '2.0.0',
		})
		const consumer = definePlugin({
			capabilities: { requires: [requirement] },
			core: '^0.0.0',
			pluginId: 'fixture.database-adapter',
			privileges: [
				{ name: 'adapter:consume', reason: 'Compiles migration intent.' },
			] as const,
			setup: ({ capabilities }) => capabilities.get(requirement),
			version: '1.0.0',
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
				contributionId: 'upgrade',
				family: 'migration',
				instanceId: 'primary',
				normalizedStaticOptions: { mode: 'safe' },
				packageVersion: '2.0.0',
				payload: { kind: 'upgrade' },
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
		const provider = definePlugin({
			capabilities: {
				provides: [
					provideAdapterContribution(versionOne, {
						contributionId: 'column',
						payload: { column: 'state' },
						protocolVersion: 1,
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.database-physical-v1',
			privileges: [
				{ name: 'adapter:consume', reason: 'Provides physical metadata.' },
			] as const,
			version: '1.0.0',
		})
		const consumer = definePlugin({
			capabilities: {
				requires: [requireCapability(versionTwo, '^2.0.0')],
			},
			core: '^0.0.0',
			pluginId: 'fixture.database-physical-v2-consumer',
			privileges: [
				{ name: 'adapter:consume', reason: 'Consumes physical metadata.' },
			] as const,
			version: '1.0.0',
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
