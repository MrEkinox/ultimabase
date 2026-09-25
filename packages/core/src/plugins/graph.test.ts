import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { definePlugin, type PluginDefinition } from './definition.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins, type NormalizedPlugin } from './normalization.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
} from './capabilities.js'

const captureFrameworkError = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		return error
	}

	throw new Error('Expected the operation to throw a FrameworkError')
}

const expectFrameworkError = (
	error: unknown,
): { readonly code: unknown; readonly internalDetails: unknown } => {
	expect(error).toBeInstanceOf(FrameworkError)

	if (
		typeof error !== 'object' ||
		error === null ||
		!('code' in error) ||
		!('internalDetails' in error)
	) {
		throw new TypeError('Expected framework error diagnostics')
	}

	return error
}

const pluginIds = (plugins: Iterable<NormalizedPlugin>): readonly string[] =>
	[...plugins].map(({ definition }) => definition.manifest.identity.pluginId)

const normalize = (
	plugins: readonly PluginDefinition[],
): readonly NormalizedPlugin[] => normalizePlugins(plugins)

describe('PluginGraph', () => {
	it('orders dependencies first and uses configuration position for ties', () => {
		let setupCalls = 0
		const base = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.base',
		})
		const firstConsumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first-consumer',
			dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }],
			setup: () => {
				setupCalls += 1
			},
		})
		const secondConsumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second-consumer',
			dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }],
		})
		const independent = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.independent',
		})
		const normalized = normalize([
			firstConsumer,
			independent,
			secondConsumer,
			base,
		])

		const firstGraph = new PluginGraph(normalized)
		const secondGraph = new PluginGraph(normalized)

		expect(pluginIds(firstGraph)).toStrictEqual([
			'fixture.independent',
			'fixture.base',
			'fixture.first-consumer',
			'fixture.second-consumer',
		])
		expect(pluginIds(secondGraph)).toStrictEqual(pluginIds(firstGraph))
		expect(firstGraph.size).toBe(4)
		expect(firstGraph.has('fixture.base')).toBe(true)
		expect(firstGraph.has('fixture.missing')).toBe(false)
		expect(firstGraph.get('fixture.base')?.definition).toBe(base)
		expect(firstGraph.get('fixture.missing')).toBeUndefined()
		expect(setupCalls).toBe(0)
		expect(Object.isFrozen(firstGraph)).toBe(true)
		expect(Object.isFrozen(firstGraph.plugins)).toBe(true)
	})

	it('uses present optional dependencies and ignores absent ones', () => {
		const cache = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.cache',
		})
		const consumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.consumer',
			dependencies: [{ pluginId: 'fixture.cache', version: '^0.0.0' }],
			optionalDependencies: [
				{ pluginId: 'fixture.cache', version: '^0.0.0' },
				{ pluginId: 'fixture.telemetry', version: '^0.0.0' },
			],
			conflicts: ['fixture.absent-conflict'],
		})

		const graph = new PluginGraph(normalize([consumer, cache]))

		expect(pluginIds(graph)).toStrictEqual([
			'fixture.cache',
			'fixture.consumer',
		])
	})

	it('validates peers without adding an ordering edge', () => {
		const protocol = definePlugin({
			pluginId: 'fixture.protocol',
			version: '1.2.0',
			core: '^0.0.0',
		})
		const extension = definePlugin({
			pluginId: 'fixture.extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
		})

		const graph = new PluginGraph(normalize([extension, protocol]))

		expect(pluginIds(graph)).toStrictEqual([
			'fixture.extension',
			'fixture.protocol',
		])
	})

	it('rejects missing or incompatible peers', () => {
		const missingPeer = definePlugin({
			pluginId: 'fixture.extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
		})
		const missingError = expectFrameworkError(
			captureFrameworkError(() => new PluginGraph(normalize([missingPeer]))),
		)
		expect(missingError.code).toBe('PLUGIN_DEPENDENCY_MISSING')

		const incompatibleProtocol = definePlugin({
			pluginId: 'fixture.protocol',
			version: '2.0.0',
			core: '^0.0.0',
		})
		const incompatibleError = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([missingPeer, incompatibleProtocol])),
			),
		)
		expect(incompatibleError.code).toBe('PLUGIN_PROTOCOL_INCOMPATIBLE')
	})

	it('requires exact peer instances and permits reverse capability ordering', () => {
		const extensionToken = defineCapability<string, readonly string[]>()({
			capabilityId: 'fixture.peer-extensions',
			version: '1.0.0',
			cardinality: 'multiple',
			lifetime: 'application',
			compose: (providers) => providers,
		})
		const extensions = optionalCapability(extensionToken, '^1.0.0')
		const engine = definePlugin({
			pluginId: 'fixture.peer-engine',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [extensions],
		})
		const extension = definePlugin({
			pluginId: 'fixture.peer-extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.peer-engine', version: '^1.0.0' }],
			capabilities: [
				provideCapability(extensionToken, {
					contributionId: 'extension',
					create: () => ({ value: 'extension' }),
				}),
			],
		})

		expect(
			pluginIds(new PluginGraph(normalize([engine, extension]))),
		).toStrictEqual(['fixture.peer-extension', 'fixture.peer-engine'])

		const secondEngine = definePlugin({
			pluginId: 'fixture.peer-engine',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
		})
		const exactEngine = definePlugin({
			pluginId: 'fixture.peer-engine',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [extensions],
		})
		const error = expectFrameworkError(
			captureFrameworkError(
				() =>
					new PluginGraph(normalize([exactEngine, secondEngine, extension])),
			),
		)
		expect(error.code).toBe('PLUGIN_CONFLICT')
	})

	it('supports semantic ranges and exact repeated-plugin instances', () => {
		const primary = definePlugin({
			pluginId: 'fixture.cache',
			instanceId: 'primary',
			version: '1.4.0',
			core: '^0.0.0',
		})
		const analytics = definePlugin({
			pluginId: 'fixture.cache',
			instanceId: 'analytics',
			version: '2.0.0',
			core: '^0.0.0',
		})
		const consumer = definePlugin({
			pluginId: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.cache',
					instanceId: 'primary',
					version: '^1.0.0',
				},
			],
		})

		expect(
			pluginIds(new PluginGraph(normalize([consumer, analytics, primary]))),
		).toStrictEqual(['fixture.cache', 'fixture.cache', 'fixture.consumer'])
	})

	it('rejects incompatible named dependency versions with protocol diagnostics', () => {
		const cache = definePlugin({
			pluginId: 'fixture.cache',
			version: '2.0.0',
			core: '^0.0.0',
		})
		const consumer = definePlugin({
			pluginId: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.cache', version: '^1.0.0' }],
		})

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([consumer, cache])),
			),
		)

		expect(error.code).toBe('PLUGIN_PROTOCOL_INCOMPATIBLE')
		expect(error.internalDetails).toStrictEqual({
			kind: 'named-plugin-version',
			pluginId: 'fixture.consumer',
			dependencyId: 'fixture.cache',
			requiredVersion: '^1.0.0',
			installedVersion: '2.0.0',
		})
	})

	it('requires exact targeting when a named dependency has repeated instances', () => {
		const primary = definePlugin({
			pluginId: 'fixture.cache',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
		})
		const secondary = definePlugin({
			pluginId: 'fixture.cache',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
		})
		const consumer = definePlugin({
			pluginId: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.cache', version: '^1.0.0' }],
		})

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([consumer, primary, secondary])),
			),
		)

		expect(error.code).toBe('PLUGIN_CONFLICT')
		expect(error.internalDetails).toStrictEqual({
			kind: 'ambiguous-plugin-dependency',
			pluginId: 'fixture.consumer',
			dependencyId: 'fixture.cache',
		})
	})

	it('uses input order when separately normalized positions are equal', () => {
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first',
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second',
		})
		const separatelyNormalized = [...normalize([first]), ...normalize([second])]

		expect(pluginIds(new PluginGraph(separatelyNormalized))).toStrictEqual([
			'fixture.first',
			'fixture.second',
		])
	})

	it('rejects a missing required dependency', () => {
		const consumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.consumer',
			dependencies: [{ pluginId: 'fixture.database', version: '^0.0.0' }],
		})

		const error = expectFrameworkError(
			captureFrameworkError(() => new PluginGraph(normalize([consumer]))),
		)

		expect(error.code).toBe('PLUGIN_DEPENDENCY_MISSING')
		expect(error.internalDetails).toStrictEqual({
			pluginId: 'fixture.consumer',
			dependencyId: 'fixture.database',
		})
	})

	it('rejects explicit plugin conflicts', () => {
		const database = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
			conflicts: ['fixture.other-database'],
		})
		const otherDatabase = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.other-database',
		})

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([database, otherDatabase])),
			),
		)

		expect(error.code).toBe('PLUGIN_CONFLICT')
		expect(error.internalDetails).toStrictEqual({
			kind: 'explicit-conflict',
			pluginIds: ['fixture.database', 'fixture.other-database'],
		})
	})

	it('rejects repeated normalized entries', () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.plugin',
		})
		// One declared plugin always produces one normalized entry.
		const [normalizedPlugin] = normalize([plugin]) as readonly [
			NormalizedPlugin,
		]

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph([normalizedPlugin, normalizedPlugin]),
			),
		)

		expect(error.code).toBe('PLUGIN_DUPLICATE')
		expect(error.internalDetails).toStrictEqual({
			pluginId: 'fixture.plugin',
			source: 'graph',
		})
	})

	it('composes unrelated plugins without implicit string slots', () => {
		const postgres = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.postgres',
		})
		const sql = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.sql',
		})

		const graph = new PluginGraph([
			...normalize([postgres]),
			...normalize([sql]),
		])

		expect(pluginIds(graph.plugins)).toStrictEqual([
			'fixture.postgres',
			'fixture.sql',
		])
	})

	it('reports a deterministic dependency cycle path', () => {
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first',
			dependencies: [
				{ pluginId: 'fixture.resolved', version: '^0.0.0' },
				{ pluginId: 'fixture.second', version: '^0.0.0' },
			],
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second',
			dependencies: [{ pluginId: 'fixture.third', version: '^0.0.0' }],
		})
		const third = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.third',
			dependencies: [{ pluginId: 'fixture.first', version: '^0.0.0' }],
		})
		const resolved = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.resolved',
		})

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([first, second, third, resolved])),
			),
		)

		expect(error.code).toBe('PLUGIN_DEPENDENCY_CYCLE')
		expect(error.internalDetails).toStrictEqual({
			cyclePath: [
				'fixture.first',
				'fixture.second',
				'fixture.third',
				'fixture.first',
			],
		})
	})

	it('guards JavaScript callers from malformed normalized input', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-TypeScript callers.
			new PluginGraph('fixture')
		}).toThrow(new TypeError('plugins must be an array'))

		const definition = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.forged',
		})

		expect(() => {
			new PluginGraph([
				// @ts-expect-error -- Graph entries require normalization provenance.
				{
					definition,
					configurationIndex: 0,
					dependencies: [],
				},
			])
		}).toThrow(new TypeError('plugins[0] must be created by normalizePlugins'))
	})
})
