import { SchemaRegistry } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { defineCapability, provideCapability } from './capabilities.js'
import { PluginGraph } from './graph.js'
import { PluginLifecycleManager } from './lifecycle-manager.js'
import { normalizePlugins } from './normalization.js'
import { plugin } from './plugin.js'
import {
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
} from './plugin-contributions.js'
import { PluginSetupRegistries } from './setup-registries.js'

const observedCapability = defineCapability<string>()({
	capabilityId: 'fixture.observed-value',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	providerPrivilege: 'runtime:observe',
	compose: (providers) => providers.join(','),
})

describe('plugin', () => {
	it('derives permissions from one ordered contribution list', () => {
		const definition = plugin({
			id: 'fixture.contribution-first',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(observedCapability, {
					contributionId: 'observed',
					create: () => ({ value: 'ready' }),
				}),
				contributeDeclarations({
					schema: () => undefined,
				}),
			],
			permissions: {
				'runtime:observe': 'Records the fixture value.',
				'schema:declare': 'Declares fixture schema metadata.',
			},
		})

		// Requests follow Core's privilege vocabulary order, not contribution order.
		expect(definition.manifest.privileges).toStrictEqual([
			{ name: 'schema:declare', reason: 'Declares fixture schema metadata.' },
			{ name: 'runtime:observe', reason: 'Records the fixture value.' },
		])
		expect(definition.manifest.capabilities.provides).toHaveLength(1)
	})

	it('generates a description for every derived privilege without a reason', () => {
		const definition = plugin({
			id: 'fixture.reasonless',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(observedCapability, {
					contributionId: 'observed',
					create: () => ({ value: 'ready' }),
				}),
				contributeDeclarations({
					schema: () => undefined,
					models: () => undefined,
				}),
				contributeDeclarations({ schema: () => undefined }),
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
			permissions: { 'model:extend': 'Adds fixture model commands.' },
		})

		expect(definition.manifest.privileges).toStrictEqual([
			{
				name: 'schema:declare',
				reason: 'Declares schema fields, options or schemas.',
			},
			{ name: 'model:extend', reason: 'Adds fixture model commands.' },
			{
				name: 'runtime:observe',
				reason:
					'Uses the Core runtime facade from a contribution callback. Provides the "fixture.observed-value" capability.',
			},
		])
	})

	it('rejects missing critical and detached permission reasons before callbacks run', () => {
		let calls = 0
		const application = contributeApplication(() => {
			calls += 1
			return { exports: undefined }
		})
		const privileged = withPluginPrivileges(application, ['authority:elevate'])

		expect(() =>
			plugin({
				id: 'fixture.missing-reason',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [privileged],
			}),
		).toThrow(
			new TypeError(
				'Missing plugin permission reason: authority:elevate is critical and must be declared in permissions with a non-empty reason',
			),
		)
		expect(() =>
			plugin({
				id: 'fixture.missing-storage-reason',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [
					contributeDeclarations({ privateStorage: () => undefined }),
				],
			}),
		).toThrow(
			new TypeError(
				'Missing plugin permission reason: storage:private is critical and must be declared in permissions with a non-empty reason',
			),
		)
		expect(() =>
			plugin({
				id: 'fixture.empty-reason',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [privileged],
				permissions: { 'authority:elevate': '' },
			}),
		).toThrow(
			new TypeError(
				'plugin permissions.authority:elevate must be a non-empty string',
			),
		)
		expect(calls).toBe(0)

		expect(() =>
			plugin({
				id: 'fixture.unused-reason',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [],
				permissions: { 'event:publish': 'No contribution uses this.' },
			}),
		).toThrow(new TypeError('Unused plugin permission reason: event:publish'))
		expect(calls).toBe(0)
	})

	it('binds application exports and lifecycle callbacks to one application', async () => {
		const events: string[] = []
		const exports = { ready: true as const }
		const definition = plugin({
			id: 'fixture.application-resource',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication(() => ({
					exports,
					connect: () => {
						events.push('connect')
					},
					startTransports: () => {
						events.push('startTransports')
					},
					stop: () => {
						events.push('stop')
					},
					dispose: () => {
						events.push('dispose')
					},
				})),
			],
		})
		const lifecycle = new PluginLifecycleManager(
			new PluginGraph(normalizePlugins([definition])),
			new PluginSetupRegistries(new SchemaRegistry()),
		)

		await lifecycle.start()
		expect(lifecycle.getPluginExports(definition)).toBe(exports)
		await lifecycle.stop()
		await lifecycle.dispose()
		expect(events).toStrictEqual([
			'connect',
			'startTransports',
			'stop',
			'dispose',
		])
	})

	it('keeps the native definition immutable without creating its resource', () => {
		let creates = 0
		const dependencies = [{ pluginId: 'fixture.services', version: '^0.0.0' }]
		const definition = plugin({
			id: 'fixture.immutable-native-plan',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies,
			optionalDependencies: [{ pluginId: 'fixture.cache', version: '^0.0.0' }],
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
			conflicts: ['fixture.other-plugin'],
			contributions: [
				contributeApplication(() => {
					creates += 1
					return {}
				}),
			],
		})

		dependencies.push({
			pluginId: 'fixture.late-dependency',
			version: '^0.0.0',
		})
		expect(creates).toBe(0)
		expect(definition.dependencies).toStrictEqual([
			{ pluginId: 'fixture.services', version: '^0.0.0' },
		])
		expect(Object.isFrozen(definition)).toBe(true)
		expect(Object.isFrozen(definition.dependencies)).toBe(true)
		expect(Object.isFrozen(definition.optionalDependencies)).toBe(true)
		expect(Object.isFrozen(definition.peers)).toBe(true)
		expect(Object.isFrozen(definition.conflicts)).toBe(true)
	})

	it('validates relationship metadata at the native definition boundary', () => {
		expect(() =>
			plugin({
				id: 'fixture.invalid-dependencies',
				version: '1.0.0',
				core: '^0.0.0',
				// @ts-expect-error -- Runtime coverage protects JavaScript callers.
				dependencies: 'services',
				contributions: [],
			}),
		).toThrow(new TypeError('dependencies must be an array'))
		expect(() =>
			plugin({
				id: 'fixture.invalid-conflicts',
				version: '1.0.0',
				core: '^0.0.0',
				// @ts-expect-error -- Runtime coverage protects JavaScript callers.
				conflicts: [42],
				contributions: [],
			}),
		).toThrow(new TypeError('conflicts[0] must be a non-empty string'))
	})

	it('rejects structural contributions and duplicate application resources', () => {
		expect(() =>
			plugin({
				id: 'fixture.forged',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [
					// @ts-expect-error -- Runtime coverage rejects structural lookalikes.
					{ kind: 'plugin-application-contribution' },
				],
			}),
		).toThrow(/must be created by a Core contribution factory/u)

		const first = contributeApplication(() => ({ exports: 'first' }))
		const second = contributeApplication(() => ({ exports: 'second' }))
		expect(() =>
			plugin({
				id: 'fixture.duplicate-application',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [first, second],
			}),
		).toThrow(
			new TypeError(
				'plugin contributions may contain at most one application resource',
			),
		)
	})
})
