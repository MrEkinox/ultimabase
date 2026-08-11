import { immutableArray, isUnknownArray } from '@ultimabase/shared'
import { satisfies } from 'semver'

import { FrameworkError } from '../errors/framework-error.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginDependency,
	type PluginIdentity,
} from './manifest.js'
import {
	assertNormalizedPlugin,
	type NormalizedPlugin,
} from './normalization.js'
import {
	createDuplicatePluginError,
	createExclusiveSlotConflictError,
} from './plugin-errors.js'
import { CapabilityInventory } from './capability-inventory.js'

interface GraphNode {
	readonly plugin: NormalizedPlugin
	readonly inputIndex: number
	readonly dependencies: GraphNode[]
	readonly dependents: GraphNode[]
	indegree: number
}

type GraphNodesByPluginId = Map<string, GraphNode[]>

const compareConfigurationOrder = (left: GraphNode, right: GraphNode): number =>
	left.plugin.configurationIndex - right.plugin.configurationIndex ||
	left.inputIndex - right.inputIndex

const allGraphNodes = (
	nodesByPluginId: ReadonlyMap<string, readonly GraphNode[]>,
): readonly GraphNode[] =>
	[...nodesByPluginId.values()].flatMap((nodes) => nodes)

const findNodeByIdentity = (
	nodesByPluginId: ReadonlyMap<string, readonly GraphNode[]>,
	identity: PluginIdentity,
): GraphNode | undefined =>
	nodesByPluginId
		.get(identity.pluginId)
		?.find(({ plugin }) =>
			isSamePluginIdentity(plugin.definition.manifest.identity, identity),
		)

const throwMissingDependency = (
	pluginIdentity: PluginIdentity,
	dependencyId: string,
): never => {
	const plugin = formatPluginIdentity(pluginIdentity)

	throw new FrameworkError(
		'PLUGIN_DEPENDENCY_MISSING',
		`Plugin "${plugin}" requires missing plugin "${dependencyId}".`,
		{
			internalDetails: {
				pluginId: pluginIdentity.pluginId,
				...(pluginIdentity.instanceId === undefined
					? {}
					: { instanceId: pluginIdentity.instanceId }),
				dependencyId,
			},
		},
	)
}

const assertRequiredDependency: (
	dependency: GraphNode | undefined,
	pluginIdentity: PluginIdentity,
	dependencyId: string,
) => asserts dependency is GraphNode = (
	dependency,
	pluginIdentity,
	dependencyId,
) => {
	if (dependency === undefined) {
		throwMissingDependency(pluginIdentity, dependencyId)
	}
}

const throwAmbiguousDependency = (
	pluginIdentity: PluginIdentity,
	dependencyId: string,
): never => {
	const plugin = formatPluginIdentity(pluginIdentity)

	throw new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugin "${plugin}" must target an exact instance of repeated plugin "${dependencyId}".`,
		{
			internalDetails: {
				kind: 'ambiguous-plugin-dependency',
				pluginId: pluginIdentity.pluginId,
				dependencyId,
			},
		},
	)
}

const throwExplicitConflict = (
	pluginIdentity: PluginIdentity,
	conflictingPluginId: string,
): never => {
	const plugin = formatPluginIdentity(pluginIdentity)

	throw new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugin "${plugin}" conflicts with "${conflictingPluginId}".`,
		{
			internalDetails: {
				kind: 'explicit-conflict',
				pluginIds: immutableArray([
					pluginIdentity.pluginId,
					conflictingPluginId,
				]),
			},
		},
	)
}

const findCyclePath = (
	unresolvedNodes: readonly GraphNode[],
): readonly string[] => {
	const unresolved = new Set(unresolvedNodes)
	const path: GraphNode[] = []
	const pathIndexes = new Map<GraphNode, number>()
	// Kahn's remainder is non-empty and every remaining node depends on another remainder node.
	const orderedUnresolvedNodes = [...unresolvedNodes].sort(
		compareConfigurationOrder,
	) as [GraphNode, ...GraphNode[]]
	let currentNode = orderedUnresolvedNodes[0]

	for (;;) {
		const repeatedIndex = pathIndexes.get(currentNode)

		if (repeatedIndex !== undefined) {
			return immutableArray(
				[...path.slice(repeatedIndex), currentNode].map(({ plugin }) =>
					formatPluginIdentity(plugin.definition.manifest.identity),
				),
			)
		}

		pathIndexes.set(currentNode, path.length)
		path.push(currentNode)

		const unresolvedDependencies = currentNode.dependencies.filter(
			(dependency) => unresolved.has(dependency),
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
): GraphNodesByPluginId => {
	const nodesByPluginId: GraphNodesByPluginId = new Map()
	const pluginsBySlot = new Map<string, NormalizedPlugin>()

	for (const [inputIndex, plugin] of plugins.entries()) {
		const identity = plugin.definition.manifest.identity
		const configuredInstances = nodesByPluginId.get(identity.pluginId) ?? []
		const duplicate = configuredInstances.some(({ plugin: candidate }) =>
			isSamePluginIdentity(candidate.definition.manifest.identity, identity),
		)

		if (duplicate) {
			throw createDuplicatePluginError(identity, 'graph')
		}

		if (
			configuredInstances.length > 0 &&
			(identity.instanceId === undefined ||
				configuredInstances.some(
					({ plugin: candidate }) =>
						candidate.definition.manifest.identity.instanceId === undefined,
				))
		) {
			throw createDuplicatePluginError(identity, 'graph')
		}

		if (plugin.definition.slot !== undefined) {
			const slotOwner = pluginsBySlot.get(plugin.definition.slot)

			if (slotOwner !== undefined) {
				throw createExclusiveSlotConflictError(
					plugin.definition.slot,
					formatPluginIdentity(slotOwner.definition.manifest.identity),
					formatPluginIdentity(identity),
				)
			}

			pluginsBySlot.set(plugin.definition.slot, plugin)
		}

		configuredInstances.push({
			plugin,
			inputIndex,
			dependencies: [],
			dependents: [],
			indegree: 0,
		})
		nodesByPluginId.set(identity.pluginId, configuredInstances)
	}

	return nodesByPluginId
}

const resolveNamedDependency = (
	nodesByPluginId: ReadonlyMap<string, readonly GraphNode[]>,
	pluginIdentity: PluginIdentity,
	dependencyDeclaration: PluginDependency,
	required: boolean,
): GraphNode | undefined => {
	const configuredCandidates =
		nodesByPluginId.get(dependencyDeclaration.pluginId) ?? []
	const candidates =
		dependencyDeclaration.instanceId === undefined
			? configuredCandidates
			: configuredCandidates.filter(
					({ plugin }) =>
						plugin.definition.manifest.identity.instanceId ===
						dependencyDeclaration.instanceId,
				)
	const dependencyTarget =
		dependencyDeclaration.instanceId === undefined
			? dependencyDeclaration.pluginId
			: `${dependencyDeclaration.pluginId} (instance ${dependencyDeclaration.instanceId})`

	if (candidates.length === 0) {
		if (required) throwMissingDependency(pluginIdentity, dependencyTarget)
		return undefined
	}

	if (candidates.length > 1) {
		throwAmbiguousDependency(pluginIdentity, dependencyDeclaration.pluginId)
	}

	const [candidate] = candidates as [GraphNode, ...GraphNode[]]
	if (
		!satisfies(
			candidate.plugin.definition.manifest.version,
			dependencyDeclaration.version,
		)
	) {
		const plugin = formatPluginIdentity(pluginIdentity)
		throw new FrameworkError(
			'PLUGIN_PROTOCOL_INCOMPATIBLE',
			`Plugin "${plugin}" requires ${dependencyTarget} version "${dependencyDeclaration.version}", but version "${candidate.plugin.definition.manifest.version}" is installed.`,
			{
				internalDetails: {
					kind: 'named-plugin-version',
					pluginId: pluginIdentity.pluginId,
					dependencyId: dependencyDeclaration.pluginId,
					requiredVersion: dependencyDeclaration.version,
					installedVersion: candidate.plugin.definition.manifest.version,
				},
			},
		)
	}

	return candidate
}

const connectDependency = (node: GraphNode, dependency: GraphNode): void => {
	if (node.dependencies.includes(dependency)) return

	node.dependencies.push(dependency)
	dependency.dependents.push(node)
	node.indegree += 1
}

const connectGraphNodes = (
	nodesByPluginId: ReadonlyMap<string, readonly GraphNode[]>,
): void => {
	for (const node of allGraphNodes(nodesByPluginId)) {
		const identity = node.plugin.definition.manifest.identity

		for (const conflictId of node.plugin.definition.conflicts ?? []) {
			if (nodesByPluginId.has(conflictId)) {
				throwExplicitConflict(identity, conflictId)
			}
		}

		for (const dependencyDeclaration of node.plugin.dependencies) {
			const dependency = resolveNamedDependency(
				nodesByPluginId,
				identity,
				dependencyDeclaration,
				true,
			)
			assertRequiredDependency(
				dependency,
				identity,
				dependencyDeclaration.pluginId,
			)
			connectDependency(node, dependency)
		}

		for (const parentIdentity of node.plugin.parentIdentities) {
			const parent = findNodeByIdentity(nodesByPluginId, parentIdentity)
			assertRequiredDependency(
				parent,
				identity,
				formatPluginIdentity(parentIdentity),
			)
			connectDependency(node, parent)
		}

		for (const optionalDependency of node.plugin.definition
			.optionalDependencies ?? []) {
			const dependency = resolveNamedDependency(
				nodesByPluginId,
				identity,
				optionalDependency,
				false,
			)
			if (dependency !== undefined) connectDependency(node, dependency)
		}
	}
}

const orderGraphNodes = (
	nodesByPluginId: ReadonlyMap<string, readonly GraphNode[]>,
): readonly NormalizedPlugin[] => {
	const nodes = allGraphNodes(nodesByPluginId)
	const readyNodes = nodes
		.filter(({ indegree }) => indegree === 0)
		.sort(compareConfigurationOrder)
	const orderedPlugins: NormalizedPlugin[] = []
	const orderedNodes = new Set<GraphNode>()
	let readyNode: GraphNode | undefined

	while ((readyNode = readyNodes.shift()) !== undefined) {
		orderedPlugins.push(readyNode.plugin)
		orderedNodes.add(readyNode)

		for (const dependent of readyNode.dependents) {
			dependent.indegree -= 1

			if (dependent.indegree === 0) {
				readyNodes.push(dependent)
				readyNodes.sort(compareConfigurationOrder)
			}
		}
	}

	if (orderedPlugins.length !== nodes.length) {
		const unresolvedNodes = nodes.filter((node) => !orderedNodes.has(node)) as [
			GraphNode,
			...GraphNode[],
		]

		throwDependencyCycle(unresolvedNodes)
	}

	return immutableArray(orderedPlugins)
}

/** Owns one validated deterministic plugin order without initializing plugins. */
export class PluginGraph implements Iterable<NormalizedPlugin> {
	readonly plugins: readonly NormalizedPlugin[]
	readonly capabilities: CapabilityInventory
	readonly #pluginsById: ReadonlyMap<string, readonly NormalizedPlugin[]>

	constructor(plugins: readonly NormalizedPlugin[]) {
		const untrustedPlugins: unknown = plugins

		if (!isUnknownArray(untrustedPlugins)) {
			throw new TypeError('plugins must be an array')
		}

		for (const [pluginIndex, plugin] of untrustedPlugins.entries()) {
			assertNormalizedPlugin(plugin, `plugins[${String(pluginIndex)}]`)
		}

		const nodesByPluginId = createGraphNodes(plugins)

		connectGraphNodes(nodesByPluginId)
		this.plugins = orderGraphNodes(nodesByPluginId)
		this.capabilities = new CapabilityInventory(this.plugins)
		const pluginsById = new Map<string, NormalizedPlugin[]>()
		for (const plugin of this.plugins) {
			const pluginId = plugin.definition.manifest.identity.pluginId
			const instances = pluginsById.get(pluginId) ?? []
			instances.push(plugin)
			pluginsById.set(pluginId, instances)
		}
		this.#pluginsById = new Map(
			[...pluginsById].map(([pluginId, instances]) => [
				pluginId,
				immutableArray(instances),
			]),
		)

		Object.freeze(this)
	}

	get size(): number {
		return this.plugins.length
	}

	get(identity: PluginIdentity | string): NormalizedPlugin | undefined {
		const instances = this.#pluginsById.get(
			typeof identity === 'string' ? identity : identity.pluginId,
		)

		if (typeof identity === 'string') {
			return instances?.length === 1 ? instances[0] : undefined
		}

		return instances?.find(({ definition }) =>
			isSamePluginIdentity(definition.manifest.identity, identity),
		)
	}

	has(identity: PluginIdentity | string): boolean {
		return this.get(identity) !== undefined
	}

	[Symbol.iterator](): Iterator<NormalizedPlugin> {
		return this.plugins[Symbol.iterator]()
	}
}
