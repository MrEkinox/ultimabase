import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { CapabilityRequirement, CapabilityToken } from './capabilities.js'
import {
	assertNormalizedPlugin,
	type NormalizedPlugin,
} from './normalization.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
	type PluginPrivilegeRequest,
} from './manifest.js'

/** Reports one statically declared provider without exposing its capability value. */
export interface CapabilityProviderInspection {
	readonly owner: PluginIdentity
}

/** Reports whether one explicit requirement has at least one compatible provider. */
export interface CapabilityRequirementInspection {
	readonly owner: PluginIdentity
	readonly requirement: CapabilityRequirement
	readonly active: boolean
}

/** Groups all static declarations that use one nominal protocol token. */
export interface CapabilityInventoryEntry {
	readonly token: CapabilityToken
	readonly providers: readonly CapabilityProviderInspection[]
	readonly requirements: readonly CapabilityRequirementInspection[]
}

interface MutableCapabilityEntry {
	readonly token: CapabilityToken
	readonly firstOwner: PluginIdentity
	readonly providers: CapabilityProviderInspection[]
	readonly requirements: {
		readonly owner: PluginIdentity
		readonly requirement: CapabilityRequirement
	}[]
}

const throwDuplicateTokenIdentity = (
	entry: MutableCapabilityEntry,
	owner: PluginIdentity,
	token: CapabilityToken,
): never => {
	throw new FrameworkError(
		'PLUGIN_CAPABILITY_CONFLICT',
		`Capability "${token.capabilityId}@${token.version}" uses distinct nominal tokens in plugins "${formatPluginIdentity(entry.firstOwner)}" and "${formatPluginIdentity(owner)}".`,
		{
			internalDetails: {
				kind: 'duplicate-capability-token',
				capabilityId: token.capabilityId,
				version: token.version,
				firstOwner: formatPluginIdentity(entry.firstOwner),
				secondOwner: formatPluginIdentity(owner),
			},
		},
	)
}

const throwMissingCapability = (
	owner: PluginIdentity,
	requirement: CapabilityRequirement,
): never => {
	throw new FrameworkError(
		'PLUGIN_CAPABILITY_MISSING',
		`Plugin "${formatPluginIdentity(owner)}" requires capability "${requirement.token.capabilityId}" version "${requirement.version}", but no compatible provider is installed.`,
		{
			internalDetails: {
				pluginId: owner.pluginId,
				...(owner.instanceId === undefined
					? {}
					: { instanceId: owner.instanceId }),
				capabilityId: requirement.token.capabilityId,
				requiredVersion: requirement.version,
			},
		},
	)
}

const registerToken = (
	entriesById: Map<string, Map<string, MutableCapabilityEntry>>,
	orderedEntries: MutableCapabilityEntry[],
	owner: PluginIdentity,
	token: CapabilityToken,
): MutableCapabilityEntry => {
	const versions =
		entriesById.get(token.capabilityId) ??
		new Map<string, MutableCapabilityEntry>()
	const existing = versions.get(token.version)

	if (existing !== undefined) {
		if (existing.token !== token) {
			throwDuplicateTokenIdentity(existing, owner, token)
		}

		return existing
	}

	const entry: MutableCapabilityEntry = {
		token,
		firstOwner: owner,
		providers: [],
		requirements: [],
	}
	versions.set(token.version, entry)
	entriesById.set(token.capabilityId, versions)
	orderedEntries.push(entry)
	return entry
}

/**
 * Owns static capability compatibility results without selecting or reading values.
 *
 * Materialization and composition deliberately remain outside this inventory.
 */
export class CapabilityInventory implements Iterable<CapabilityInventoryEntry> {
	readonly entries: readonly CapabilityInventoryEntry[]

	constructor(plugins: readonly NormalizedPlugin[]) {
		const untrustedPlugins: unknown = plugins
		if (!isUnknownArray(untrustedPlugins)) {
			throw new TypeError('plugins must be an array')
		}

		for (const [index, plugin] of plugins.entries()) {
			assertNormalizedPlugin(plugin, `plugins[${String(index)}]`)
		}

		const entriesById = new Map<string, Map<string, MutableCapabilityEntry>>()
		const orderedEntries: MutableCapabilityEntry[] = []

		for (const plugin of plugins) {
			const owner = plugin.definition.manifest.identity
			const declarations = plugin.definition.manifest.capabilities

			for (const declaration of declarations.provides) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					declaration.token,
				).providers.push(immutableRecord({ owner }))
			}

			for (const requirement of [
				...declarations.requires,
				...declarations.optional,
			]) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					requirement.token,
				).requirements.push(immutableRecord({ owner, requirement }))
			}
		}

		this.entries = immutableArray(
			orderedEntries.map((entry) => {
				const active = entry.providers.length > 0

				for (const { owner, requirement } of entry.requirements) {
					if (!requirement.optional && !active) {
						throwMissingCapability(owner, requirement)
					}
				}

				return immutableRecord({
					token: entry.token,
					providers: immutableArray(entry.providers),
					requirements: immutableArray(
						entry.requirements.map(({ owner, requirement }) =>
							immutableRecord({ owner, requirement, active }),
						),
					),
				})
			}),
		)

		Object.freeze(this)
	}

	/** Reports one declared requirement's compatibility state for policy inspection. */
	isRequirementActive(
		owner: PluginIdentity,
		requirement: CapabilityRequirement,
	): boolean {
		const entry = this.entries.find(({ token }) => token === requirement.token)

		return (
			entry?.requirements.find(
				(candidate) =>
					candidate.requirement === requirement &&
					isSamePluginIdentity(candidate.owner, owner),
			)?.active ?? false
		)
	}

	/** Keeps inactive capability-conditioned privilege requests unenforceable. */
	isPrivilegeActive(
		owner: PluginIdentity,
		request: PluginPrivilegeRequest,
	): boolean {
		return (
			request.when === undefined ||
			this.isRequirementActive(owner, request.when)
		)
	}

	[Symbol.iterator](): Iterator<CapabilityInventoryEntry> {
		return this.entries[Symbol.iterator]()
	}
}
