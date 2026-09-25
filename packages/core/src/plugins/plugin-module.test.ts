import { describe, expect, it } from 'vitest'

import { definePlugin, definePluginModule } from '../index.js'

const fixtureModule = definePluginModule({
	core: '^0.0.0',
	pluginId: 'fixture.core-module',
	version: '1.2.3',
})

describe('definePluginModule', () => {
	it('binds immutable package facts across configured instances', () => {
		const first = fixtureModule.plugin({
			instanceId: 'first',
			setup: () => ({ ready: true as const }),
		})
		const second = fixtureModule.plugin({ instanceId: 'second' })

		expect(fixtureModule).toMatchObject({
			core: '^0.0.0',
			pluginId: 'fixture.core-module',
			version: '1.2.3',
		})
		expect(Object.isFrozen(fixtureModule)).toBe(true)
		expect(first.manifest.identity).toStrictEqual({
			instanceId: 'first',
			pluginId: 'fixture.core-module',
		})
		expect(second.manifest.identity).toStrictEqual({
			instanceId: 'second',
			pluginId: 'fixture.core-module',
		})
	})

	it('delegates the complete instance definition to Core unchanged', () => {
		const definition = {
			conflicts: ['fixture.legacy'],
			instanceId: 'editorial',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
			privileges: [
				{
					name: 'runtime:observe' as const,
					reason: 'Records workflow timing.',
				},
			],
		} as const
		const fromModule = fixtureModule.plugin(definition)
		const fromDefinition = definePlugin({
			...definition,
			core: '^0.0.0',
			pluginId: 'fixture.core-module',
			version: '1.2.3',
		})

		expect(fromModule.manifest).toStrictEqual(fromDefinition.manifest)
		expect(fromModule.conflicts).toStrictEqual(fromDefinition.conflicts)
		expect(fromModule.peers).toStrictEqual(fromDefinition.peers)
	})

	it('rejects malformed modules and package-fact overrides', () => {
		const untypedPlugin = (options: unknown): unknown =>
			(fixtureModule.plugin as (input: unknown) => unknown)(options)

		expect(() => definePluginModule(null as never)).toThrow(
			'plugin module options must be a plain object',
		)
		expect(() => untypedPlugin(null)).toThrow(
			'plugin module definition must be a plain object',
		)
		expect(() => untypedPlugin({ pluginId: 'fixture.forged' })).toThrow(
			'cannot override package-owned pluginId',
		)
	})
})
