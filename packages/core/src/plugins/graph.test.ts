import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { definePlugin, type PluginDefinition } from './definition.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins, type NormalizedPlugin } from './normalization.js'

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

const pluginNames = (plugins: Iterable<NormalizedPlugin>): readonly string[] =>
	[...plugins].map(({ definition }) => definition.name)

const normalize = (
	plugins: readonly PluginDefinition[],
): readonly NormalizedPlugin[] => normalizePlugins(plugins)

describe('PluginGraph', () => {
	it('orders dependencies first and uses configuration position for ties', () => {
		let setupCalls = 0
		const base = definePlugin({ name: 'fixture.base' })
		const firstConsumer = definePlugin({
			name: 'fixture.first-consumer',
			dependencies: ['fixture.base'],
			setup: () => {
				setupCalls += 1
			},
		})
		const secondConsumer = definePlugin({
			name: 'fixture.second-consumer',
			dependencies: ['fixture.base'],
		})
		const independent = definePlugin({ name: 'fixture.independent' })
		const normalized = normalize([
			firstConsumer,
			independent,
			secondConsumer,
			base,
		])

		const firstGraph = new PluginGraph(normalized)
		const secondGraph = new PluginGraph(normalized)

		expect(pluginNames(firstGraph)).toStrictEqual([
			'fixture.independent',
			'fixture.base',
			'fixture.first-consumer',
			'fixture.second-consumer',
		])
		expect(pluginNames(secondGraph)).toStrictEqual(pluginNames(firstGraph))
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
		const cache = definePlugin({ name: 'fixture.cache' })
		const consumer = definePlugin({
			name: 'fixture.consumer',
			dependencies: ['fixture.cache'],
			optionalDependencies: ['fixture.cache', 'fixture.telemetry'],
			conflicts: ['fixture.absent-conflict'],
		})

		const graph = new PluginGraph(normalize([consumer, cache]))

		expect(pluginNames(graph)).toStrictEqual([
			'fixture.cache',
			'fixture.consumer',
		])
	})

	it('uses input order when separately normalized positions are equal', () => {
		const first = definePlugin({ name: 'fixture.first' })
		const second = definePlugin({ name: 'fixture.second' })
		const separatelyNormalized = [...normalize([first]), ...normalize([second])]

		expect(pluginNames(new PluginGraph(separatelyNormalized))).toStrictEqual([
			'fixture.first',
			'fixture.second',
		])
	})

	it('rejects a missing required dependency', () => {
		const consumer = definePlugin({
			name: 'fixture.consumer',
			dependencies: ['fixture.database'],
		})

		const error = expectFrameworkError(
			captureFrameworkError(() => new PluginGraph(normalize([consumer]))),
		)

		expect(error.code).toBe('PLUGIN_DEPENDENCY_MISSING')
		expect(error.internalDetails).toStrictEqual({
			pluginName: 'fixture.consumer',
			dependencyName: 'fixture.database',
		})
	})

	it('rejects explicit plugin conflicts', () => {
		const database = definePlugin({
			name: 'fixture.database',
			conflicts: ['fixture.other-database'],
		})
		const otherDatabase = definePlugin({ name: 'fixture.other-database' })

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph(normalize([database, otherDatabase])),
			),
		)

		expect(error.code).toBe('PLUGIN_CONFLICT')
		expect(error.internalDetails).toStrictEqual({
			kind: 'explicit-conflict',
			pluginNames: ['fixture.database', 'fixture.other-database'],
		})
	})

	it('rejects repeated normalized entries', () => {
		const plugin = definePlugin({ name: 'fixture.plugin' })
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
			pluginName: 'fixture.plugin',
			source: 'graph',
		})
	})

	it('rejects slot collisions across separately normalized configurations', () => {
		const postgres = definePlugin({
			name: 'fixture.postgres',
			slot: 'database-adapter',
		})
		const sql = definePlugin({
			name: 'fixture.sql',
			slot: 'database-adapter',
		})

		const error = expectFrameworkError(
			captureFrameworkError(
				() => new PluginGraph([...normalize([postgres]), ...normalize([sql])]),
			),
		)

		expect(error.code).toBe('PLUGIN_CONFLICT')
		expect(error.internalDetails).toStrictEqual({
			kind: 'exclusive-slot',
			slot: 'database-adapter',
			pluginNames: ['fixture.postgres', 'fixture.sql'],
		})
	})

	it('reports a deterministic dependency cycle path', () => {
		const first = definePlugin({
			name: 'fixture.first',
			dependencies: ['fixture.resolved', 'fixture.second'],
		})
		const second = definePlugin({
			name: 'fixture.second',
			dependencies: ['fixture.third'],
		})
		const third = definePlugin({
			name: 'fixture.third',
			dependencies: ['fixture.first'],
		})
		const resolved = definePlugin({ name: 'fixture.resolved' })

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

		const definition = definePlugin({ name: 'fixture.forged' })

		expect(() => {
			new PluginGraph([
				// @ts-expect-error -- Graph entries require normalization provenance.
				{
					definition,
					configurationIndex: 0,
					parentNames: [],
					dependencies: [],
				},
			])
		}).toThrow(new TypeError('plugins[0] must be created by normalizePlugins'))
	})
})
