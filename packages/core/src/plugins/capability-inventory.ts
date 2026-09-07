import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	composeCapability,
	runCapabilityDecorator,
	type CapabilityDecoratorDeclaration,
	type CapabilityProviderDeclaration,
	type CapabilityReplacementDeclaration,
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
import { buildReplacementChains } from './capability-replacement-planning.js'
import { canonicalSchemaCompilerFoundation } from './schema-compiler-ir/schema-compiler-capability.js'
import { canonicalRuntimeExecutorFoundation } from '../runtime/capabilities.js'
import { isAdapterCapability } from '../runtime/adapters/capabilities.js'
import { isAdapterContributionCapability } from '../runtime/adapters/contributions.js'
import {
	applicationRequestExecutionCapability,
	canonicalApplicationRequestExecutionFoundation,
} from '../runtime/application/application-request-execution.js'
import {
	applicationOperationTransportPlanningCapability,
	canonicalApplicationOperationTransportPlanningFoundation,
} from '../runtime/application/application-operation-transport-planning.js'

/** Reports one provider or replacement without exposing its value or factory. */
export interface CapabilityProviderInspection {
	readonly kind: 'provider' | 'replacement'
	readonly owner: PluginIdentity
	readonly contributionId: string
}

/** Reports one complete replacement chain at its stable provider position. */
export interface CapabilityProviderChainInspection {
	readonly position: number
	readonly contributions: readonly CapabilityProviderInspection[]
}

/** Reports one whole-consumer decorator in deterministic application order. */
export interface CapabilityDecoratorInspection {
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
	readonly replacements: readonly CapabilityProviderInspection[]
	readonly decorators: readonly CapabilityDecoratorInspection[]
	readonly providerChains: readonly CapabilityProviderChainInspection[]
	readonly requirements: readonly CapabilityRequirementInspection[]
}

export interface OwnedProvider {
	readonly kind: 'provider' | 'replacement'
	readonly owner: PluginIdentity
	readonly plugin?: NormalizedPlugin
	readonly version: string
	readonly declaration:
		CapabilityProviderDeclaration | CapabilityReplacementDeclaration
}

export interface OwnedDecorator {
	readonly owner: PluginIdentity
	readonly plugin: NormalizedPlugin
	readonly declaration: CapabilityDecoratorDeclaration
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
	readonly replacements: OwnedProvider[]
	readonly decorators: OwnedDecorator[]
	readonly requirements: OwnedRequirement[]
}

interface CapabilityPlan {
	readonly entry: MutableCapabilityEntry
	readonly chains: readonly (readonly OwnedProvider[])[]
}

interface CapabilityInventoryState {
	readonly plans: readonly CapabilityPlan[]
	readonly declarationConsumers: Map<CapabilityToken, unknown>
}

/** Retains trusted ownership for one final provider selected by the graph. */
export interface SelectedCapabilityProvider {
	readonly declaration:
		CapabilityProviderDeclaration | CapabilityReplacementDeclaration
	readonly owner: PluginIdentity
	readonly version: string
}

const inventoryStates = new WeakMap<
	CapabilityInventory,
	CapabilityInventoryState
>()

const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
}

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
		replacements: [],
		decorators: [],
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
 * Owns static capability compatibility and replacement plans.
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

		const consumesApplicationRequests = plugins.some((plugin) => {
			const capabilities = plugin.definition.manifest.capabilities
			return [...capabilities.requires, ...capabilities.optional].some(
				(requirement) =>
					requirement.token === applicationRequestExecutionCapability,
			)
		})
		const consumesOperationTransportPlanning = plugins.some((plugin) => {
			const capabilities = plugin.definition.manifest.capabilities
			return [...capabilities.requires, ...capabilities.optional].some(
				(requirement) =>
					requirement.token === applicationOperationTransportPlanningCapability,
			)
		})
		for (const foundation of [
			canonicalSchemaCompilerFoundation,
			canonicalRuntimeExecutorFoundation,
			...(consumesApplicationRequests
				? [canonicalApplicationRequestExecutionFoundation]
				: []),
			...(consumesOperationTransportPlanning
				? [canonicalApplicationOperationTransportPlanningFoundation]
				: []),
		]) {
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
			for (const declaration of declarations.replaces) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					declaration.token,
				).replacements.push({
					kind: 'replacement',
					owner,
					plugin,
					version,
					declaration,
				})
			}
			for (const declaration of declarations.decorates) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					declaration.token,
				).decorators.push({ owner, plugin, declaration })
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
				chains: buildReplacementChains(orderedEntries, entry),
			}),
		)

		this.entries = immutableArray(
			plans.map(({ entry, chains }) => {
				const active = chains.length > 0
				for (const { owner, requirement } of entry.requirements) {
					if (!requirement.optional && !active) {
						throwMissingCapability(owner, requirement)
					}
				}

				return immutableRecord({
					token: entry.token,
					providers: immutableArray(entry.providers.map(inspectProvider)),
					replacements: immutableArray(entry.replacements.map(inspectProvider)),
					decorators: immutableArray(
						entry.decorators.map(({ owner, declaration }) =>
							immutableRecord({
								owner: immutableRecord({
									pluginId: owner.pluginId,
									...(owner.instanceId === undefined
										? {}
										: { instanceId: owner.instanceId }),
								}),
								contributionId: declaration.contributionId,
							}),
						),
					),
					providerChains: immutableArray(
						chains.map((chain, position) =>
							immutableRecord({
								position,
								contributions: immutableArray(chain.map(inspectProvider)),
							}),
						),
					),
					requirements: immutableArray(
						entry.requirements.map(({ owner, requirement }) =>
							immutableRecord({ owner, requirement, active }),
						),
					),
				})
			}),
		)

		inventoryStates.set(this, {
			plans: immutableArray(plans),
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
	for (const { entry, chains } of state.plans) {
		if (entry.token.lifetime !== 'declaration') continue
		// An absent optional capability has no consumer view. In particular, a
		// single-capability composer must never receive an impossible empty tuple.
		if (chains.length === 0) continue

		const providers = chains.map((chain) => {
			const finalContribution = chain.at(-1)
			if (
				finalContribution === undefined ||
				!('value' in finalContribution.declaration)
			) {
				throw new TypeError('Declaration capability contribution has no value')
			}
			return finalContribution.declaration.value
		})
		let consumer: unknown = composeCapability(entry.token, providers)
		for (const decorator of entry.decorators.toReversed()) {
			consumer = runCapabilityDecorator(decorator.declaration, consumer)
		}
		state.declarationConsumers.set(entry.token, consumer)
	}
}

/** Reads one already composed declaration consumer for an exact requirement. */
export const readDeclarationCapability = (
	inventory: CapabilityInventory,
	requirement: CapabilityRequirement,
): unknown =>
	getInventoryState(inventory).declarationConsumers.get(requirement.token)

/** Reads one exact final provider without exposing it through public inspection. */
export const readSelectedCapabilityProvider = (
	inventory: CapabilityInventory,
	token: CapabilityToken,
): SelectedCapabilityProvider => {
	const plan = getInventoryState(inventory).plans.find(
		(candidate) => candidate.entry.token === token,
	)
	const selected = plan?.chains[0]?.at(-1)

	if (selected === undefined || plan?.chains.length !== 1) {
		throw new TypeError(
			`Capability "${token.capabilityId}" has no unique selected provider`,
		)
	}

	return immutableRecord({
		declaration: selected.declaration,
		owner: immutableRecord({
			pluginId: selected.owner.pluginId,
			...(selected.owner.instanceId === undefined
				? {}
				: { instanceId: selected.owner.instanceId }),
		}),
		version: selected.version,
	})
}

/** Supplies application materialization with final static contribution plans. */
export const readCapabilityPlans = (
	inventory: CapabilityInventory,
): readonly CapabilityPlan[] => getInventoryState(inventory).plans
