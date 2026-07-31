import { immutableArray, isUnknownArray } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	assertNormalizedPlugin,
	type NormalizedPlugin,
} from './normalization.js'
import {
	createDuplicatePluginError,
	createExclusiveSlotConflictError,
} from './plugin-errors.js'

interface GraphNode {
	readonly plugin: NormalizedPlugin
	readonly inputIndex: number
	readonly dependencyNames: Set<string>
	readonly dependencies: GraphNode[]
	readonly dependents: GraphNode[]
	indegree: number
}

const compareConfigurationOrder = (left: GraphNode, right: GraphNode): number =>
	left.plugin.configurationIndex - right.plugin.configurationIndex ||
	left.inputIndex - right.inputIndex

const throwDuplicatePlugin = (pluginName: string): never => {
	throw createDuplicatePluginError(pluginName, 'graph')
}

const throwMissingDependency = (
	pluginName: string,
	dependencyName: string,
): never => {
	throw new FrameworkError(
		'PLUGIN_DEPENDENCY_MISSING',
		`Plugin "${pluginName}" requires missing plugin "${dependencyName}".`,
		{
			internalDetails: {
				pluginName,
				dependencyName,
			},
		},
	)
}

const throwExplicitConflict = (
	pluginName: string,
	conflictingPluginName: string,
): never => {
	throw new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugin "${pluginName}" conflicts with "${conflictingPluginName}".`,
		{
			internalDetails: {
				kind: 'explicit-conflict',
				pluginNames: immutableArray([pluginName, conflictingPluginName]),
			},
		},
	)
}

const findCyclePath = (
	unresolvedNodes: readonly GraphNode[],
): readonly string[] => {
	const unresolvedNames = new Set(
		unresolvedNodes.map(({ plugin }) => plugin.definition.name),
	)
	const path: string[] = []
	const pathIndexes = new Map<string, number>()
	// Kahn's remainder is non-empty and every remaining node depends on another remainder node.
	const orderedUnresolvedNodes = [...unresolvedNodes].sort(
		compareConfigurationOrder,
	) as [GraphNode, ...GraphNode[]]
	let currentNode = orderedUnresolvedNodes[0]

	for (;;) {
		const currentName = currentNode.plugin.definition.name
		const repeatedIndex = pathIndexes.get(currentName)

		if (repeatedIndex !== undefined) {
			return immutableArray([...path.slice(repeatedIndex), currentName])
		}

		pathIndexes.set(currentName, path.length)
		path.push(currentName)

		const unresolvedDependencies = currentNode.dependencies.filter(
			({ plugin }) => unresolvedNames.has(plugin.definition.name),
		) as [GraphNode, ...GraphNode[]]

		currentNode = unresolvedDependencies[0]
	}
}

const throwDependencyCycle = (unresolvedNodes: readonly GraphNode[]): never => {
	const cyclePath = findCyclePath(unresolvedNodes)

	throw new FrameworkError(
		'PLUGIN_DEPENDENCY_CYCLE',
		`Plugin dependency cycle detected: ${cyclePath.join(' -> ')}.`,
		{
			internalDetails: { cyclePath },
		},
	)
}

const createGraphNodes = (
	plugins: readonly NormalizedPlugin[],
): Map<string, GraphNode> => {
	const nodesByName = new Map<string, GraphNode>()
	const pluginsBySlot = new Map<string, NormalizedPlugin>()

	for (const [inputIndex, plugin] of plugins.entries()) {
		const pluginName = plugin.definition.name

		if (nodesByName.has(pluginName)) {
			throwDuplicatePlugin(pluginName)
		}

		if (plugin.definition.slot !== undefined) {
			const slotOwner = pluginsBySlot.get(plugin.definition.slot)

			if (slotOwner !== undefined) {
				throw createExclusiveSlotConflictError(
					plugin.definition.slot,
					slotOwner.definition.name,
					pluginName,
				)
			}

			pluginsBySlot.set(plugin.definition.slot, plugin)
		}

		nodesByName.set(pluginName, {
			plugin,
			inputIndex,
			dependencyNames: new Set(),
			dependencies: [],
			dependents: [],
			indegree: 0,
		})
	}

	return nodesByName
}

const connectGraphNodes = (
	nodesByName: ReadonlyMap<string, GraphNode>,
): void => {
	for (const node of nodesByName.values()) {
		const pluginName = node.plugin.definition.name

		for (const conflictName of node.plugin.definition.conflicts ?? []) {
			if (nodesByName.has(conflictName)) {
				throwExplicitConflict(pluginName, conflictName)
			}
		}

		for (const dependencyName of node.plugin.dependencies) {
			if (!nodesByName.has(dependencyName)) {
				throwMissingDependency(pluginName, dependencyName)
			}

			node.dependencyNames.add(dependencyName)
		}

		for (const optionalDependencyName of node.plugin.definition
			.optionalDependencies ?? []) {
			if (nodesByName.has(optionalDependencyName)) {
				node.dependencyNames.add(optionalDependencyName)
			}
		}
	}

	for (const node of nodesByName.values()) {
		for (const [dependencyName, dependencyNode] of nodesByName) {
			if (!node.dependencyNames.has(dependencyName)) {
				continue
			}

			node.dependencies.push(dependencyNode)
			dependencyNode.dependents.push(node)
			node.indegree += 1
		}
	}
}

const orderGraphNodes = (
	nodesByName: ReadonlyMap<string, GraphNode>,
): readonly NormalizedPlugin[] => {
	const readyNodes = [...nodesByName.values()]
		.filter(({ indegree }) => indegree === 0)
		.sort(compareConfigurationOrder)
	const orderedPlugins: NormalizedPlugin[] = []
	let readyNode: GraphNode | undefined

	while ((readyNode = readyNodes.shift()) !== undefined) {
		orderedPlugins.push(readyNode.plugin)

		for (const dependent of readyNode.dependents) {
			dependent.indegree -= 1

			if (dependent.indegree === 0) {
				readyNodes.push(dependent)
				readyNodes.sort(compareConfigurationOrder)
			}
		}
	}

	if (orderedPlugins.length !== nodesByName.size) {
		const orderedNames = new Set(
			orderedPlugins.map(({ definition }) => definition.name),
		)
		const unresolvedNodes = [...nodesByName.values()].filter(
			({ plugin }) => !orderedNames.has(plugin.definition.name),
		) as [GraphNode, ...GraphNode[]]

		throwDependencyCycle(unresolvedNodes)
	}

	return immutableArray(orderedPlugins)
}

/** Owns one validated deterministic plugin order without initializing plugins. */
export class PluginGraph implements Iterable<NormalizedPlugin> {
	readonly plugins: readonly NormalizedPlugin[]
	readonly #pluginsByName: ReadonlyMap<string, NormalizedPlugin>

	constructor(plugins: readonly NormalizedPlugin[]) {
		const untrustedPlugins: unknown = plugins

		if (!isUnknownArray(untrustedPlugins)) {
			throw new TypeError('plugins must be an array')
		}

		for (const [pluginIndex, plugin] of untrustedPlugins.entries()) {
			assertNormalizedPlugin(plugin, `plugins[${String(pluginIndex)}]`)
		}

		const nodesByName = createGraphNodes(plugins)

		connectGraphNodes(nodesByName)
		this.plugins = orderGraphNodes(nodesByName)
		this.#pluginsByName = new Map(
			this.plugins.map((plugin) => [plugin.definition.name, plugin]),
		)

		Object.freeze(this)
	}

	get size(): number {
		return this.plugins.length
	}

	get(pluginName: string): NormalizedPlugin | undefined {
		return this.#pluginsByName.get(pluginName)
	}

	has(pluginName: string): boolean {
		return this.#pluginsByName.has(pluginName)
	}

	[Symbol.iterator](): Iterator<NormalizedPlugin> {
		return this.plugins[Symbol.iterator]()
	}
}
