import { describe, expect, it } from 'vitest'

import {
	defineFieldBuilderMethod,
	definePlugin,
	stringField,
} from '../index.js'

describe('definePlugin', () => {
	it('creates immutable static definitions without running callbacks', () => {
		let declarationCalls = 0
		let setupCalls = 0
		let hookCalls = 0
		const dependencies = [{ pluginId: 'fixture.services', version: '^0.0.0' }]
		const privileges = [
			{
				name: 'adapter:consume' as const,
				reason: 'Provides database persistence.',
			},
		]
		const environment = ['environment:network' as const]
		const hooks = {
			connect: () => {
				hookCalls += 1
			},
		}
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.database',
			version: '1.0.0',
			privileges,
			environment,
			dependencies,
			optionalDependencies: [{ pluginId: 'fixture.cache', version: '^0.0.0' }],
			conflicts: ['fixture.other-database'],
			declareFields: (fields) => {
				declarationCalls += 1
				fields.register(
					defineFieldBuilderMethod({
						factory: stringField,
						fieldKind: 'fixture.text',
						name: 'text',
						typegen: {
							methodType: 'TextFieldBuilderMethod',
							module: '@fixture/text-plugin',
							valueType: 'TextValue',
						},
					}),
				)
			},
			setup: () => {
				setupCalls += 1

				return { dialect: 'postgres' as const }
			},
			hooks,
		})

		dependencies.push({
			pluginId: 'fixture.late-dependency',
			version: '^0.0.0',
		})
		privileges[0] = {
			name: 'adapter:consume',
			reason: 'Late mutation must not alter the manifest.',
		}
		environment.length = 0

		expect(setupCalls).toBe(0)
		expect(hookCalls).toBe(0)
		expect(declarationCalls).toBe(0)
		expect(plugin).toMatchObject({
			manifest: {
				identity: { pluginId: 'fixture.database' },
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{
						name: 'adapter:consume',
						reason: 'Provides database persistence.',
					},
				],
				environment: ['environment:network'],
			},
			dependencies: [{ pluginId: 'fixture.services', version: '^0.0.0' }],
			optionalDependencies: [{ pluginId: 'fixture.cache', version: '^0.0.0' }],
			conflicts: ['fixture.other-database'],
		})
		expect('setup' in plugin).toBe(false)
		expect('declareFields' in plugin).toBe(false)
		expect('hooks' in plugin).toBe(false)
		expect(Object.isFrozen(plugin)).toBe(true)
		expect(Object.isFrozen(plugin.manifest)).toBe(true)
		expect(Object.isFrozen(plugin.manifest.identity)).toBe(true)
		expect(Object.isFrozen(plugin.manifest.privileges)).toBe(true)
		expect(Object.isFrozen(plugin.manifest.privileges[0])).toBe(true)
		expect(Object.isFrozen(plugin.manifest.environment)).toBe(true)
		expect(Object.isFrozen(plugin.dependencies)).toBe(true)
		expect(Object.isFrozen(plugin.optionalDependencies)).toBe(true)
		expect(Object.isFrozen(plugin.conflicts)).toBe(true)
	})

	it('retains immutable nested plugin definitions by identity', () => {
		const child = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.child',
		})
		const nestedPlugins = [child]
		const parent = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.parent',
			plugins: nestedPlugins,
		})

		nestedPlugins.pop()

		expect(parent.plugins).toStrictEqual([child])
		expect(parent.plugins?.[0]).toBe(child)
		expect(Object.isFrozen(parent.plugins)).toBe(true)
	})

	it('protects JavaScript callers from malformed plugin metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null plugin options.
			definePlugin(null)
		}).toThrow(new TypeError('plugin options must be a plain object'))
		expect(() =>
			definePlugin({ version: '0.0.0', core: '^0.0.0', pluginId: '' }),
		).toThrow(new TypeError('pluginId must be a non-empty string'))
		expect(() =>
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- String slots were removed in favor of single capabilities.
				slot: '',
			}),
		).toThrow(new TypeError('plugin options contain unknown option: slot'))
		expect(() =>
			definePlugin({ core: '^0.0.0', pluginId: 'fixture.plugin', version: '' }),
		).toThrow(new TypeError('version must be a non-empty string'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Static field declarations must remain callable.
				declareFields: 'later',
			})
		}).toThrow(new TypeError('declareFields must be a function'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Setup metadata must remain callable.
				setup: 'later',
			})
		}).toThrow(new TypeError('setup must be a function'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Dependency metadata must remain an array.
				dependencies: 'services',
			})
		}).toThrow(new TypeError('dependencies must be an array'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// Runtime validation also protects JavaScript callers from empty names.
				optionalDependencies: [{ pluginId: '', version: '^1.0.0' }],
			})
		}).toThrow(
			new TypeError(
				'optionalDependencies[0].pluginId must be a non-empty string',
			),
		)
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Conflict metadata must contain strings.
				conflicts: [42],
			})
		}).toThrow(new TypeError('conflicts[0] must be a non-empty string'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Hooks must retain their object shape.
				hooks: [],
			})
		}).toThrow(new TypeError('hooks must be a plain object'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Lifecycle hook names form a closed contract.
				hooks: { initialize: () => undefined },
			})
		}).toThrow(new TypeError('Unknown plugin lifecycle hook: initialize'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Lifecycle hook values must remain callable.
				hooks: { connect: true },
			})
		}).toThrow(new TypeError('hooks.connect must be a function'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Nested metadata must remain an array.
				plugins: {},
			})
		}).toThrow(new TypeError('plugins must be an array'))
		expect(() => {
			definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.plugin',
				// @ts-expect-error -- Nested definitions require Core provenance.
				plugins: [{ name: 'forged' }],
			})
		}).toThrow(new TypeError('plugins[0] must be created by definePlugin'))
	})
})
