import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import { assertPluginDefinition, type PluginDefinition } from './definition.js'

/** Represents one unique definition and its normalized configuration metadata. */
export interface NormalizedPlugin {
	readonly definition: PluginDefinition
	readonly configurationIndex: number
	readonly parentNames: readonly string[]
	readonly dependencies: readonly string[]
}

interface MutableNormalizedPlugin {
	readonly definition: PluginDefinition
	readonly configurationIndex: number
	readonly parentNames: string[]
	readonly dependencies: string[]
}

const addUniqueName = (names: string[], name: string): void => {
	if (!names.includes(name)) {
		names.push(name)
	}
}

const throwDuplicateDefinition = (name: string): never => {
	throw new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugin "${name}" has multiple distinct definitions.`,
		{
			internalDetails: {
				kind: 'duplicate-name',
				pluginName: name,
			},
		},
	)
}

const throwExclusiveSlotConflict = (
	slot: string,
	firstPluginName: string,
	secondPluginName: string,
): never => {
	throw new FrameworkError(
		'PLUGIN_CONFLICT',
		`Plugins "${firstPluginName}" and "${secondPluginName}" both occupy exclusive slot "${slot}".`,
		{
			internalDetails: {
				kind: 'exclusive-slot',
				slot,
				pluginNames: immutableArray([firstPluginName, secondPluginName]),
			},
		},
	)
}

const snapshotNormalizedPlugin = (
	plugin: MutableNormalizedPlugin,
): NormalizedPlugin =>
	immutableRecord({
		definition: plugin.definition,
		configurationIndex: plugin.configurationIndex,
		parentNames: immutableArray(plugin.parentNames),
		dependencies: immutableArray(plugin.dependencies),
	})

/** Flattens nested composition into immutable metadata without initializing plugins. */
export const normalizePlugins = (
	plugins: readonly PluginDefinition[],
): readonly NormalizedPlugin[] => {
	const untrustedPlugins: unknown = plugins

	if (!isUnknownArray(untrustedPlugins)) {
		throw new TypeError('plugins must be an array')
	}

	const normalizedPlugins: MutableNormalizedPlugin[] = []
	const pluginsByName = new Map<string, MutableNormalizedPlugin>()
	const pluginsBySlot = new Map<string, PluginDefinition>()

	const visitPlugin = (
		untrustedPlugin: unknown,
		path: string,
		parentName?: string,
	): void => {
		assertPluginDefinition(untrustedPlugin, path)

		const existingPlugin = pluginsByName.get(untrustedPlugin.name)

		if (existingPlugin !== undefined) {
			if (existingPlugin.definition !== untrustedPlugin) {
				throwDuplicateDefinition(untrustedPlugin.name)
			}

			if (parentName !== undefined) {
				addUniqueName(existingPlugin.parentNames, parentName)
				addUniqueName(existingPlugin.dependencies, parentName)
			}

			return
		}

		if (untrustedPlugin.slot !== undefined) {
			const slotOwner = pluginsBySlot.get(untrustedPlugin.slot)

			if (slotOwner !== undefined) {
				throwExclusiveSlotConflict(
					untrustedPlugin.slot,
					slotOwner.name,
					untrustedPlugin.name,
				)
			}

			pluginsBySlot.set(untrustedPlugin.slot, untrustedPlugin)
		}

		const normalizedPlugin: MutableNormalizedPlugin = {
			definition: untrustedPlugin,
			configurationIndex: normalizedPlugins.length,
			parentNames: [],
			dependencies: [...(untrustedPlugin.dependencies ?? [])],
		}

		if (parentName !== undefined) {
			normalizedPlugin.parentNames.push(parentName)
			addUniqueName(normalizedPlugin.dependencies, parentName)
		}

		normalizedPlugins.push(normalizedPlugin)
		pluginsByName.set(untrustedPlugin.name, normalizedPlugin)

		for (const [childIndex, childPlugin] of (
			untrustedPlugin.plugins ?? []
		).entries()) {
			visitPlugin(
				childPlugin,
				`${path}.plugins[${String(childIndex)}]`,
				untrustedPlugin.name,
			)
		}
	}

	for (const [pluginIndex, plugin] of untrustedPlugins.entries()) {
		visitPlugin(plugin, `plugins[${String(pluginIndex)}]`)
	}

	return immutableArray(normalizedPlugins.map(snapshotNormalizedPlugin))
}
