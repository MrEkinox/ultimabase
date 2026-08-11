import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertPluginDefinition, type PluginDefinition } from './definition.js'
import {
	isSamePluginIdentity,
	type PluginDependency,
	type PluginIdentity,
} from './manifest.js'
import { createDuplicatePluginError } from './plugin-errors.js'

declare const normalizedPluginBrand: unique symbol

/** Represents one unique definition and its normalized configuration metadata. */
export interface NormalizedPlugin {
	readonly [normalizedPluginBrand]: true
	readonly definition: PluginDefinition
	readonly configurationIndex: number
	readonly parentIdentities: readonly PluginIdentity[]
	readonly dependencies: readonly PluginDependency[]
}

interface MutableNormalizedPlugin {
	readonly definition: PluginDefinition
	readonly configurationIndex: number
	readonly parentIdentities: PluginIdentity[]
	readonly dependencies: PluginDependency[]
}

const declaredNormalizedPlugins = new WeakSet<object>()

export const assertNormalizedPlugin: (
	value: unknown,
	path: string,
) => asserts value is NormalizedPlugin = (value, path) => {
	if (!isPlainRecord(value) || !declaredNormalizedPlugins.has(value)) {
		throw new TypeError(`${path} must be created by normalizePlugins`)
	}
}

const addUniqueIdentity = (
	identities: PluginIdentity[],
	identity: PluginIdentity,
): void => {
	if (
		!identities.some((candidate) => isSamePluginIdentity(candidate, identity))
	) {
		identities.push(identity)
	}
}

const throwDuplicateDefinition = (identity: PluginIdentity): never => {
	throw createDuplicatePluginError(identity, 'definition')
}

const snapshotNormalizedPlugin = (
	plugin: MutableNormalizedPlugin,
): NormalizedPlugin => {
	const snapshot = immutableRecord({
		definition: plugin.definition,
		configurationIndex: plugin.configurationIndex,
		parentIdentities: immutableArray(plugin.parentIdentities),
		dependencies: immutableArray(plugin.dependencies),
	})

	declaredNormalizedPlugins.add(snapshot)

	// The private brand mirrors the provenance recorded above without leaking runtime metadata.
	return snapshot as NormalizedPlugin
}

/** Flattens nested composition into immutable metadata without initializing plugins. */
export const normalizePlugins = (
	plugins: readonly PluginDefinition[],
): readonly NormalizedPlugin[] => {
	const untrustedPlugins: unknown = plugins

	if (!isUnknownArray(untrustedPlugins)) {
		throw new TypeError('plugins must be an array')
	}

	const normalizedPlugins: MutableNormalizedPlugin[] = []
	const pluginsById = new Map<string, MutableNormalizedPlugin[]>()

	const visitPlugin = (
		untrustedPlugin: unknown,
		path: string,
		parentIdentity?: PluginIdentity,
	): void => {
		assertPluginDefinition(untrustedPlugin, path)
		const identity = untrustedPlugin.manifest.identity
		const configuredInstances = pluginsById.get(identity.pluginId) ?? []
		const existingPlugin = configuredInstances.find(({ definition }) =>
			isSamePluginIdentity(definition.manifest.identity, identity),
		)

		if (existingPlugin !== undefined) {
			if (existingPlugin.definition !== untrustedPlugin) {
				throwDuplicateDefinition(identity)
			}

			if (parentIdentity !== undefined) {
				addUniqueIdentity(existingPlugin.parentIdentities, parentIdentity)
			}

			return
		}

		if (
			configuredInstances.length > 0 &&
			(identity.instanceId === undefined ||
				configuredInstances.some(
					({ definition }) =>
						definition.manifest.identity.instanceId === undefined,
				))
		) {
			throwDuplicateDefinition(identity)
		}

		const normalizedPlugin: MutableNormalizedPlugin = {
			definition: untrustedPlugin,
			configurationIndex: normalizedPlugins.length,
			parentIdentities: [],
			dependencies: [...(untrustedPlugin.dependencies ?? [])],
		}

		if (parentIdentity !== undefined) {
			normalizedPlugin.parentIdentities.push(parentIdentity)
		}

		normalizedPlugins.push(normalizedPlugin)
		configuredInstances.push(normalizedPlugin)
		pluginsById.set(identity.pluginId, configuredInstances)

		for (const [childIndex, childPlugin] of (
			untrustedPlugin.plugins ?? []
		).entries()) {
			visitPlugin(
				childPlugin,
				`${path}.plugins[${String(childIndex)}]`,
				identity,
			)
		}
	}

	for (const [pluginIndex, plugin] of untrustedPlugins.entries()) {
		visitPlugin(plugin, `plugins[${String(pluginIndex)}]`)
	}

	return immutableArray(normalizedPlugins.map(snapshotNormalizedPlugin))
}
