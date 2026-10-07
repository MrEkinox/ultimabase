import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	composeCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CapabilityToken,
} from './capabilities.js'
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
import { planCapabilityProviders } from './capability-provider-planning.js'
import { isAdapterCapability } from '../runtime/adapters/capabilities.js'
import { isAdapterContributionCapability } from '../runtime/adapters/contributions.js'
import { canonicalApplicationRequestExecutionFoundation } from '../runtime/application/application-request-execution.js'
import { canonicalApplicationOperationTransportPlanningFoundation } from '../runtime/application/application-operation-transport-planning.js'
import { canonicalApplicationSchemaMutationSurfaceFoundation } from '../runtime/application/application-schema-mutation-surface.js'
import { throwCapabilityConflict } from './capability-conflict.js'

/** Reports one provider without exposing its value or factory. */
export interface CapabilityProviderInspection {
	readonly kind: 'provider'
	readonly owner: PluginIdentity
	readonly contributionId: string
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

export interface OwnedProvider {
	readonly kind: 'provider'
	readonly owner: PluginIdentity
	readonly plugin?: NormalizedPlugin
	readonly version: string
	readonly declaration: CapabilityProviderDeclaration
}

export interface OwnedRequirement {
	readonly owner: PluginIdentity
	readonly plugin: NormalizedPlugin
	readonly requirement: CapabilityRequirement
}

export interface MutableCapabilityEntry {
	readonly token: CapabilityToken
	readonly firstOwner: PluginIdentity
	readonly providers: OwnedProvider[]
	readonly requirements: OwnedRequirement[]
}

interface CapabilityPlan {
	readonly entry: MutableCapabilityEntry
	readonly providers: readonly OwnedProvider[]
}

interface CapabilityInventoryState {
	readonly plansByToken: ReadonlyMap<CapabilityToken, CapabilityPlan>
	readonly declarationConsumers: Map<CapabilityToken, unknown>
}

const inventoryStates = new WeakMap<
	CapabilityInventory,
	CapabilityInventoryState
>()

const throwDuplicateTokenIdentity = (
	entry: MutableCapabilityEntry,
	owner: PluginIdentity,
	token: CapabilityToken,
): never => {
	return throwCapabilityConflict(
		`Capability "${token.capabilityId}@${token.version}" uses distinct nominal tokens in plugins "${formatPluginIdentity(entry.firstOwner)}" and "${formatPluginIdentity(owner)}".`,
		{
			kind: 'duplicate-capability-token',
			capabilityId: token.capabilityId,
			version: token.version,
			firstOwner: formatPluginIdentity(entry.firstOwner),
			secondOwner: formatPluginIdentity(owner),
		},
	)
}

const throwMissingCapability = (
	owner: PluginIdentity,
	requirement: CapabilityRequirement,
): never => {
	throw new FrameworkError(
		isAdapterCapability(requirement.token) ||
			isAdapterContributionCapability(requirement.token)
			? 'PLUGIN_ADAPTER_CAPABILITY_MISSING'
			: 'PLUGIN_CAPABILITY_MISSING',
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

const inspectProvider = (
	contribution: OwnedProvider,
): CapabilityProviderInspection =>
	immutableRecord({
		kind: contribution.kind,
		owner: immutableRecord({
			pluginId: contribution.owner.pluginId,
			...(contribution.owner.instanceId === undefined
				? {}
				: { instanceId: contribution.owner.instanceId }),
		}),
		contributionId: contribution.declaration.contributionId,
	})

const getInventoryState = (
	inventory: CapabilityInventory,
): CapabilityInventoryState => {
	const state = inventoryStates.get(inventory)
	if (state === undefined) throw new TypeError('Unknown capability inventory')
	return state
}

/**
 * Owns static capability compatibility and provider order.
 *
 * Executable values and factories never enter its public inspection model.
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

		// One requirement inventory selects only the Core foundations a plugin consumes.
		const consumedTokens = new Set(
			plugins.flatMap((plugin) => {
				const capabilities = plugin.definition.manifest.capabilities
				return [...capabilities.requires, ...capabilities.optional].map(
					({ token }) => token,
				)
			}),
		)
		for (const foundation of [
			canonicalApplicationRequestExecutionFoundation,
			canonicalApplicationOperationTransportPlanningFoundation,
			canonicalApplicationSchemaMutationSurfaceFoundation,
		]) {
			if (!consumedTokens.has(foundation.declaration.token)) continue
			registerToken(
				entriesById,
				orderedEntries,
				foundation.owner,
				foundation.declaration.token,
			).providers.push({
				kind: 'provider',
				owner: foundation.owner,
				version: foundation.version,
				declaration: foundation.declaration,
			})
		}

		for (const plugin of plugins) {
			const owner = plugin.definition.manifest.identity
			const version = plugin.definition.manifest.version
			const declarations = plugin.definition.manifest.capabilities

			for (const declaration of declarations.provides) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					declaration.token,
				).providers.push({
					kind: 'provider',
					owner,
					plugin,
					version,
					declaration,
				})
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
				).requirements.push({ owner, plugin, requirement })
			}
		}

		const plans = orderedEntries.map((entry) =>
			immutableRecord({
				entry,
				providers: planCapabilityProviders(orderedEntries, entry),
			}),
		)

		this.entries = immutableArray(
			plans.map(({ entry, providers }) => {
				const active = providers.length > 0
				for (const { owner, requirement } of entry.requirements) {
					if (!requirement.optional && !active) {
						throwMissingCapability(owner, requirement)
					}
				}

				return immutableRecord({
					token: entry.token,
					providers: immutableArray(entry.providers.map(inspectProvider)),
					requirements: immutableArray(
						entry.requirements.map(({ owner, requirement }) =>
							immutableRecord({ owner, requirement, active }),
						),
					),
				})
			}),
		)

		inventoryStates.set(this, {
			plansByToken: new Map(plans.map((plan) => [plan.entry.token, plan])),
			declarationConsumers: new Map(),
		})
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

/** Executes pure declaration composition only after privilege policy succeeds. */
export const composeDeclarationCapabilities = (
	inventory: CapabilityInventory,
): void => {
	const state = getInventoryState(inventory)
	for (const { entry, providers } of state.plansByToken.values()) {
		if (entry.token.lifetime !== 'declaration') continue
		// An absent optional capability has no consumer view. In particular, a
		// single-capability composer must never receive an impossible empty tuple.
		if (providers.length === 0) continue

		const values = providers.map(({ declaration }) => {
			if (!('value' in declaration)) {
				throw new TypeError('Declaration capability contribution has no value')
			}
			return declaration.value
		})
		const consumer: unknown = composeCapability(entry.token, values)
		state.declarationConsumers.set(entry.token, consumer)
	}
}

/** Reads one already composed declaration consumer for an exact requirement. */
export const readDeclarationCapability = (
	inventory: CapabilityInventory,
	requirement: CapabilityRequirement,
): unknown =>
	getInventoryState(inventory).declarationConsumers.get(requirement.token)

/** Supplies application materialization with final static contribution plans. */
export const readCapabilityPlans = (
	inventory: CapabilityInventory,
): ReadonlyMap<CapabilityToken, CapabilityPlan> =>
	getInventoryState(inventory).plansByToken
