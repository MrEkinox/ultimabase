import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertPluginDefinition, type PluginDefinition } from './definition.js'
import {
	createDuplicatePluginError,
	createExclusiveSlotConflictError,
} from './plugin-errors.js'

declare const normalizedPluginBrand: unique symbol

/** Represents one unique definition and its normalized configuration metadata. */
export interface NormalizedPlugin {
	readonly [normalizedPluginBrand]: true
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

const declaredNormalizedPlugins = new WeakSet<object>()

export const assertNormalizedPlugin: (
	value: unknown,
	path: string,
) => asserts value is NormalizedPlugin = (value, path) => {
	if (!isPlainRecord(value) || !declaredNormalizedPlugins.has(value)) {
		throw new TypeError(`${path} must be created by normalizePlugins`)
	}
}

const addUniqueName = (names: string[], name: string): void => {
	if (!names.includes(name)) {
		names.push(name)
	}
}

const throwDuplicateDefinition = (name: string): never => {
	throw createDuplicatePluginError(name, 'definition')
}

const throwExclusiveSlotConflict = (
	slot: string,
	firstPluginName: string,
	secondPluginName: string,
): never => {
	throw createExclusiveSlotConflictError(
		slot,
		firstPluginName,
		secondPluginName,
	)
}

const snapshotNormalizedPlugin = (
	plugin: MutableNormalizedPlugin,
): NormalizedPlugin => {
	const snapshot = immutableRecord({
		definition: plugin.definition,
		configurationIndex: plugin.configurationIndex,
		parentNames: immutableArray(plugin.parentNames),
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
