import {
	SchemaRegistry,
	Schema,
	defineSchemaExtension,
} from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { createServiceToken } from '../services/service-token.js'
import {
	ContributionRegistry,
	PluginSetupRegistries,
	type PluginContributionRegistry,
} from './setup-registries.js'

const PortServiceToken = createServiceToken<number>('fixture.port')

describe('ContributionRegistry', () => {
	it('records immutable contributions through an owner-bound scope', () => {
		const registry = new ContributionRegistry()
		const pluginRegistry = registry.forPlugin('fixture.plugin')
		const handler = { run: () => 'handled' }

		pluginRegistry.register('fixture.handler', handler)

		expect(pluginRegistry.size).toBe(1)
		expect(pluginRegistry.has('fixture.handler')).toBe(true)
		expect(pluginRegistry.get('fixture.handler')).toStrictEqual({
			name: 'fixture.handler',
			ownerPlugin: 'fixture.plugin',
			value: handler,
		})
		expect(pluginRegistry.get('fixture.handler')?.value).toBe(handler)
		expect(pluginRegistry.values()).toStrictEqual(registry.values())
		expect(Object.isFrozen(pluginRegistry)).toBe(true)
		expect(Object.isFrozen(pluginRegistry.get('fixture.handler'))).toBe(true)
		expect(Object.isFrozen(pluginRegistry.values())).toBe(true)
	})

	it('rejects ambiguous names without replacing the first owner', () => {
		const registry = new ContributionRegistry()
		const first = registry.forPlugin('fixture.first')
		const second = registry.forPlugin('fixture.second')

		first.register('fixture.handler', 'first')

		expect(() => {
			second.register('fixture.handler', 'second')
		}).toThrow(
			expect.objectContaining({
				code: 'PLUGIN_CONFLICT',
				internalDetails: {
					kind: 'duplicate-contribution',
					contributionName: 'fixture.handler',
					pluginNames: ['fixture.first', 'fixture.second'],
				},
			}),
		)
		expect(registry.get('fixture.handler')?.value).toBe('first')
	})

	it('validates owner and contribution names for JavaScript callers', () => {
		const registry = new ContributionRegistry()

		expect(() => registry.forPlugin('')).toThrow(
			new TypeError('pluginId must be a non-empty string'),
		)
		expect(() => registry.has('')).toThrow(
			new TypeError('contribution name must be a non-empty string'),
		)
		expect(() => registry.get('')).toThrow(
			new TypeError('contribution name must be a non-empty string'),
		)
		expect(() => {
			registry.forPlugin('fixture.plugin').register('', true)
		}).toThrow(new TypeError('contribution name must be a non-empty string'))
	})
})

describe('PluginSetupRegistries', () => {
	it('binds every setup contribution to its plugin owner', () => {
		const schemas = new SchemaRegistry()
		const setupRegistries = new PluginSetupRegistries(schemas)
		const context = setupRegistries.forPlugin('fixture.plugin')
		const contributionRegistries: readonly PluginContributionRegistry[] = [
			context.registries.extensions,
			context.registries.operators,
			context.registries.hooks,
			context.registries.generators,
			context.registries.transports,
			context.registries.pipelines,
			context.registries.events,
			context.registries.commands,
		]

		context.services.provide(PortServiceToken, 1337)

		for (const [index, registry] of contributionRegistries.entries()) {
			registry.register(`fixture.contribution.${String(index)}`, index)
		}

		expect(context.schemas).toBe(schemas)
		expect(context.fieldBuilderMethods).toStrictEqual([])
		expect(Object.isFrozen(context.fieldBuilderMethods)).toBe(true)
		expect(setupRegistries.services.ownerOf(PortServiceToken)).toBe(
			'fixture.plugin',
		)
		expect(contributionRegistries).toHaveLength(8)
		expect(
			contributionRegistries.every(
				(registry) => registry.values()[0]?.ownerPlugin === 'fixture.plugin',
			),
		).toBe(true)
		expect(setupRegistries.forPlugin('fixture.plugin')).toBe(context)
		expect(Object.isFrozen(context)).toBe(true)
		expect(Object.isFrozen(context.registries)).toBe(true)
	})

	it('makes unsupported schema extensions observable after setup', () => {
		const permissions = defineSchemaExtension('fixture.permissions', {})
		const schema = Schema.define({
			className: 'Post',
			fields: (field) => ({ title: field.string() }),
			extensions: [permissions],
		})
		const setupRegistries = new PluginSetupRegistries(
			new SchemaRegistry([schema]),
		)

		expect(
			setupRegistries.extensions.has(
				`${permissions.scope}:${permissions.name}`,
			),
		).toBe(false)
	})

	it.concurrent('keeps application contributions isolated', async () => {
		const first = new PluginSetupRegistries(new SchemaRegistry())
		const second = new PluginSetupRegistries(new SchemaRegistry())

		await Promise.all([
			Promise.resolve().then(() => {
				first
					.forPlugin('fixture.shared')
					.registries.commands.register('fixture.command', 'first')
			}),
			Promise.resolve().then(() => {
				second
					.forPlugin('fixture.shared')
					.registries.commands.register('fixture.command', 'second')
			}),
		])

		expect(first.commands.get('fixture.command')?.value).toBe('first')
		expect(second.commands.get('fixture.command')?.value).toBe('second')
		expect(first.commands.values()).not.toBe(second.commands.values())
	})

	it('validates scoped plugin IDs', () => {
		const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())

		expect(() => setupRegistries.forPlugin('')).toThrow(
			new TypeError('pluginId must be a non-empty string'),
		)
	})

	it('exposes immutable ordered snapshots without owner-scoped writes', () => {
		const setupRegistries = new PluginSetupRegistries(new SchemaRegistry())
		const first = setupRegistries.forPlugin('fixture.first')
		const second = setupRegistries.forPlugin('fixture.second')

		first.registries.hooks.register('fixture.first.before', 'first')
		second.registries.hooks.register('fixture.second.before', 'second')

		const contributions = setupRegistries.getContributions('hooks')

		expect(contributions.map(({ name }) => name)).toStrictEqual([
			'fixture.first.before',
			'fixture.second.before',
		])
		expect(Object.isFrozen(contributions)).toBe(true)
		expect(() => setupRegistries.getContributions('unknown' as never)).toThrow(
			new TypeError('Unknown contribution category: unknown'),
		)
		expect(() => setupRegistries.getContributions('' as never)).toThrow(
			new TypeError('contribution category must be a non-empty string'),
		)
	})
})
