import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { type PluginDefinition } from './definition.js'
import { plugin as createPlugin } from './plugin.js'
import { contributeApplication } from './plugin-contributions.js'

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
		const base = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.base',
			contributions: [],
		})
		const firstConsumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first-consumer',
			dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }],
			contributions: [
				contributeApplication((context) => {
					setupCalls += 1
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const secondConsumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second-consumer',
			dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }],
			contributions: [],
		})
		const independent = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.independent',
			contributions: [],
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
		const cache = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.cache',
			contributions: [],
		})
		const consumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.consumer',
			dependencies: [{ pluginId: 'fixture.cache', version: '^0.0.0' }],
			optionalDependencies: [
				{ pluginId: 'fixture.cache', version: '^0.0.0' },
				{ pluginId: 'fixture.telemetry', version: '^0.0.0' },
			],
			conflicts: ['fixture.absent-conflict'],
			contributions: [],
		})

		const graph = new PluginGraph(normalize([consumer, cache]))

		expect(pluginIds(graph)).toStrictEqual([
			'fixture.cache',
			'fixture.consumer',
		])
	})

	it('validates peers without adding an ordering edge', () => {
		const protocol = createPlugin({
			id: 'fixture.protocol',
			version: '1.2.0',
			core: '^0.0.0',
			contributions: [],
		})
		const extension = createPlugin({
			id: 'fixture.extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
			contributions: [],
		})

		const graph = new PluginGraph(normalize([extension, protocol]))

		expect(pluginIds(graph)).toStrictEqual([
			'fixture.extension',
			'fixture.protocol',
		])
	})

	it('rejects missing or incompatible peers', () => {
		const missingPeer = createPlugin({
			id: 'fixture.extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
			contributions: [],
		})
		const missingError = expectFrameworkError(
			captureFrameworkError(() => new PluginGraph(normalize([missingPeer]))),
		)
		expect(missingError.code).toBe('PLUGIN_DEPENDENCY_MISSING')

		const incompatibleProtocol = createPlugin({
			id: 'fixture.protocol',
			version: '2.0.0',
			core: '^0.0.0',
			contributions: [],
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
		const engine = createPlugin({
			id: 'fixture.peer-engine',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [extensions],
		})
		const extension = createPlugin({
			id: 'fixture.peer-extension',
			version: '1.0.0',
			core: '^0.0.0',
			peers: [{ pluginId: 'fixture.peer-engine', version: '^1.0.0' }],
			contributions: [
				provideCapability(extensionToken, {
					contributionId: 'extension',
					create: () => ({ value: 'extension' }),
				}),
			],
		})

		expect(
			pluginIds(new PluginGraph(normalize([engine, extension]))),
		).toStrictEqual(['fixture.peer-extension', 'fixture.peer-engine'])

		const secondEngine = createPlugin({
			id: 'fixture.peer-engine',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		const exactEngine = createPlugin({
			id: 'fixture.peer-engine',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [extensions],
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
		const primary = createPlugin({
			id: 'fixture.cache',
			instanceId: 'primary',
			version: '1.4.0',
			core: '^0.0.0',
			contributions: [],
		})
		const analytics = createPlugin({
			id: 'fixture.cache',
			instanceId: 'analytics',
			version: '2.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		const consumer = createPlugin({
			id: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.cache',
					instanceId: 'primary',
					version: '^1.0.0',
				},
			],
			contributions: [],
		})

		expect(
			pluginIds(new PluginGraph(normalize([consumer, analytics, primary]))),
		).toStrictEqual(['fixture.cache', 'fixture.cache', 'fixture.consumer'])
	})

	it('rejects incompatible named dependency versions with protocol diagnostics', () => {
		const cache = createPlugin({
			id: 'fixture.cache',
			version: '2.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		const consumer = createPlugin({
			id: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.cache', version: '^1.0.0' }],
			contributions: [],
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
		const primary = createPlugin({
			id: 'fixture.cache',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		const secondary = createPlugin({
			id: 'fixture.cache',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [],
		})
		const consumer = createPlugin({
			id: 'fixture.consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.cache', version: '^1.0.0' }],
			contributions: [],
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
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first',
			contributions: [],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second',
			contributions: [],
		})
		const separatelyNormalized = [...normalize([first]), ...normalize([second])]

		expect(pluginIds(new PluginGraph(separatelyNormalized))).toStrictEqual([
			'fixture.first',
			'fixture.second',
		])
	})

	it('rejects a missing required dependency', () => {
		const consumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.consumer',
			dependencies: [{ pluginId: 'fixture.database', version: '^0.0.0' }],
			contributions: [],
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
		const database = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			conflicts: ['fixture.other-database'],
			contributions: [],
		})
		const otherDatabase = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.other-database',
			contributions: [],
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.plugin',
			contributions: [],
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
		const postgres = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.postgres',
			contributions: [],
		})
		const sql = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.sql',
			contributions: [],
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
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.first',
			dependencies: [
				{ pluginId: 'fixture.resolved', version: '^0.0.0' },
				{ pluginId: 'fixture.second', version: '^0.0.0' },
			],
			contributions: [],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.second',
			dependencies: [{ pluginId: 'fixture.third', version: '^0.0.0' }],
			contributions: [],
		})
		const third = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.third',
			dependencies: [{ pluginId: 'fixture.first', version: '^0.0.0' }],
			contributions: [],
		})
		const resolved = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.resolved',
			contributions: [],
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

		const definition = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.forged',
			contributions: [],
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
