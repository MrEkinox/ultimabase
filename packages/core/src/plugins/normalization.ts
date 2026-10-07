import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import { assertPluginDefinition, type PluginDefinition } from './definition.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginDependency,
	type PluginIdentity,
} from './manifest.js'

declare const normalizedPluginBrand: unique symbol

/** Represents one unique definition and its normalized configuration metadata. */
export interface NormalizedPlugin {
	readonly [normalizedPluginBrand]: true
	readonly definition: PluginDefinition
	readonly configurationIndex: number
	readonly dependencies: readonly PluginDependency[]
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

/** Creates one stable duplicate diagnostic shared by both graph boundaries. */
export const createDuplicatePluginError = (
	identity: PluginIdentity,
	source: 'definition' | 'graph',
): FrameworkError<'PLUGIN_DUPLICATE'> =>
	new FrameworkError(
		'PLUGIN_DUPLICATE',
		`Plugin "${formatPluginIdentity(identity)}" was declared more than once.`,
		{
			internalDetails: {
				pluginId: identity.pluginId,
				...(identity.instanceId === undefined
					? {}
					: { instanceId: identity.instanceId }),
				source,
			},
		},
	)

/** Snapshots one flat plugin list without initializing definitions. */
export const normalizePlugins = (
	plugins: readonly PluginDefinition[],
): readonly NormalizedPlugin[] => {
	const untrustedPlugins: unknown = plugins
	if (!isUnknownArray(untrustedPlugins)) {
		throw new TypeError('plugins must be an array')
	}

	const normalizedPlugins: NormalizedPlugin[] = []
	for (const [index, plugin] of untrustedPlugins.entries()) {
		assertPluginDefinition(plugin, `plugins[${String(index)}]`)
		const identity = plugin.manifest.identity
		const instances = normalizedPlugins
			.map(({ definition }) => definition)
			.filter(({ manifest }) => manifest.identity.pluginId === identity.pluginId)
		const existing = instances.find(({ manifest }) =>
			isSamePluginIdentity(manifest.identity, identity),
		)
		// Repeating the exact same definition is idempotent; any other repeat is ambiguous.
		if (existing === plugin) continue
		if (
			existing !== undefined ||
			(instances.length > 0 &&
				(identity.instanceId === undefined ||
					instances.some(
						({ manifest }) => manifest.identity.instanceId === undefined,
					)))
		) {
			throw createDuplicatePluginError(identity, 'definition')
		}

		const snapshot = immutableRecord({
			definition: plugin,
			configurationIndex: normalizedPlugins.length,
			dependencies: immutableArray([...(plugin.dependencies ?? [])]),
		})
		declaredNormalizedPlugins.add(snapshot)
		// The private brand mirrors the provenance recorded above without leaking runtime metadata.
		normalizedPlugins.push(snapshot as NormalizedPlugin)
	}

	return immutableArray(normalizedPlugins)
}
