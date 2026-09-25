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
import { createDuplicatePluginError } from './plugin-errors.js'
import { CapabilityInventory } from './capability-inventory.js'
import type { CapabilityToken } from './capability-token.js'

interface GraphNode {
	readonly plugin: NormalizedPlugin
	readonly inputIndex: number
	readonly dependencies: GraphNode[]
	readonly dependents: GraphNode[]
	indegree: number
}

type GraphNodesByPluginId = Map<string, GraphNode[]>

interface GraphNodes {
	readonly all: readonly GraphNode[]
	readonly byPluginId: GraphNodesByPluginId
	readonly providersByToken: ReadonlyMap<CapabilityToken, readonly GraphNode[]>
}

const compareConfigurationOrder = (left: GraphNode, right: GraphNode): number =>
	left.plugin.configurationIndex - right.plugin.configurationIndex ||
	left.inputIndex - right.inputIndex

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

const createGraphNodes = (plugins: readonly NormalizedPlugin[]): GraphNodes => {
	const nodesByPluginId: GraphNodesByPluginId = new Map()

	for (const [inputIndex, plugin] of plugins.entries()) {
		const identity = plugin.definition.manifest.identity
		const configuredInstances = nodesByPluginId.get(identity.pluginId) ?? []
		const duplicate = configuredInstances.some(({ plugin: candidate }) => {
			const candidateIdentity = candidate.definition.manifest.identity
			return (
				isSamePluginIdentity(candidateIdentity, identity) ||
				identity.instanceId === undefined ||
				candidateIdentity.instanceId === undefined
			)
		})
		if (duplicate) throw createDuplicatePluginError(identity, 'graph')

		const node: GraphNode = {
			plugin,
			inputIndex,
			dependencies: [],
			dependents: [],
			indegree: 0,
		}
		configuredInstances.push(node)
		nodesByPluginId.set(identity.pluginId, configuredInstances)
	}

	const all = [...nodesByPluginId.values()].flatMap((nodes) => nodes)
	const providersByToken = new Map<CapabilityToken, GraphNode[]>()
	for (const node of all) {
		for (const { token } of node.plugin.definition.manifest.capabilities
			.provides) {
			const providers = providersByToken.get(token) ?? []
			providers.push(node)
			providersByToken.set(token, providers)
		}
	}

	return { all, byPluginId: nodesByPluginId, providersByToken }
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

const connectGraphNodes = (graph: GraphNodes): void => {
	for (const node of graph.all) {
		const identity = node.plugin.definition.manifest.identity

		for (const conflictId of node.plugin.definition.conflicts ?? []) {
			if (graph.byPluginId.has(conflictId)) {
				throwExplicitConflict(identity, conflictId)
			}
		}

		for (const dependencyDeclaration of node.plugin.dependencies) {
			const dependency =
				resolveNamedDependency(
					graph.byPluginId,
					identity,
					dependencyDeclaration,
					true,
				) ?? throwMissingDependency(identity, dependencyDeclaration.pluginId)
			connectDependency(node, dependency)
		}

		for (const optionalDependency of node.plugin.definition
			.optionalDependencies ?? []) {
			const dependency = resolveNamedDependency(
				graph.byPluginId,
				identity,
				optionalDependency,
				false,
			)
			if (dependency !== undefined) connectDependency(node, dependency)
		}

		for (const peer of node.plugin.definition.peers ?? []) {
			// A peer proves presence and protocol compatibility only. Capability
			// requirements remain solely responsible for any necessary ordering.
			resolveNamedDependency(graph.byPluginId, identity, peer, true)
		}
	}

	for (const consumer of graph.all) {
		const requirements = [
			...consumer.plugin.definition.manifest.capabilities.requires,
			...consumer.plugin.definition.manifest.capabilities.optional,
		]

		for (const requirement of requirements) {
			if (requirement.phase === 'setup') continue

			for (const provider of graph.providersByToken.get(requirement.token) ??
				[]) {
				if (provider === consumer) continue
				connectDependency(consumer, provider)
			}
		}
	}
}

const orderGraphNodes = (graph: GraphNodes): readonly NormalizedPlugin[] => {
	const readyNodes = graph.all
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

	if (orderedPlugins.length !== graph.all.length) {
		const unresolvedNodes = graph.all.filter(
			(node) => !orderedNodes.has(node),
		) as [GraphNode, ...GraphNode[]]

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

		const graph = createGraphNodes(plugins)

		connectGraphNodes(graph)
		this.plugins = orderGraphNodes(graph)
		this.capabilities = new CapabilityInventory(this.plugins)
		this.#pluginsById = new Map(
			[...graph.byPluginId].map(([pluginId, nodes]) => [
				pluginId,
				immutableArray(nodes.map(({ plugin }) => plugin)),
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
