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
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'

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

interface OwnedProvider {
	readonly kind: 'provider' | 'replacement'
	readonly owner: PluginIdentity
	readonly plugin: NormalizedPlugin
	readonly declaration:
		CapabilityProviderDeclaration | CapabilityReplacementDeclaration
}

interface OwnedDecorator {
	readonly owner: PluginIdentity
	readonly plugin: NormalizedPlugin
	readonly declaration: CapabilityDecoratorDeclaration
}

interface OwnedRequirement {
	readonly owner: PluginIdentity
	readonly requirement: CapabilityRequirement
}

interface MutableCapabilityEntry {
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
		replacements: [],
		decorators: [],
		requirements: [],
	}
	versions.set(token.version, entry)
	entriesById.set(token.capabilityId, versions)
	orderedEntries.push(entry)
	return entry
}

const isSameContribution = (
	left: OwnedProvider,
	rightOwner: PluginIdentity,
	rightContributionId: string,
): boolean =>
	left.declaration.contributionId === rightContributionId &&
	isSamePluginIdentity(left.owner, rightOwner)

const findContribution = (
	entry: MutableCapabilityEntry,
	owner: PluginIdentity,
	contributionId: string,
): OwnedProvider | undefined =>
	[...entry.providers, ...entry.replacements].find((contribution) =>
		isSameContribution(contribution, owner, contributionId),
	)

const assertUniqueContributionIds = (entry: MutableCapabilityEntry): void => {
	const contributions = [
		...entry.providers,
		...entry.replacements,
		...entry.decorators,
	]

	for (const [index, contribution] of contributions.entries()) {
		const duplicate = contributions
			.slice(index + 1)
			.find(
				(candidate) =>
					candidate.declaration.contributionId ===
						contribution.declaration.contributionId &&
					isSamePluginIdentity(candidate.owner, contribution.owner),
			)
		if (duplicate !== undefined) {
			throwCapabilityConflict(
				`Plugin "${formatPluginIdentity(contribution.owner)}" declares duplicate contribution "${contribution.declaration.contributionId}" for capability "${entry.token.capabilityId}".`,
				{
					kind: 'duplicate-capability-contribution',
					plugin: formatPluginIdentity(contribution.owner),
					capabilityId: entry.token.capabilityId,
					contributionId: contribution.declaration.contributionId,
				},
			)
		}
	}
}

const isRequirementActiveInEntries = (
	entries: readonly MutableCapabilityEntry[],
	owner: PluginIdentity,
	requirement: CapabilityRequirement,
): boolean => {
	const entry = entries.find(({ token }) => token === requirement.token)
	return (
		entry?.requirements.some(
			(candidate) =>
				candidate.requirement === requirement &&
				isSamePluginIdentity(candidate.owner, owner),
		) === true && entry.providers.length > 0
	)
}

const hasActivePrivilege = (
	entries: readonly MutableCapabilityEntry[],
	contribution: OwnedProvider | OwnedDecorator,
	privilege: PluginPrivilege,
): boolean =>
	contribution.plugin.definition.manifest.privileges.some(
		(request) =>
			request.name === privilege &&
			(request.when === undefined ||
				isRequirementActiveInEntries(
					entries,
					contribution.owner,
					request.when,
				)),
	)

const assertContributionPrivilege = (
	entries: readonly MutableCapabilityEntry[],
	entry: MutableCapabilityEntry,
	contribution: OwnedProvider | OwnedDecorator,
	privilege: 'capability:decorate' | 'capability:replace',
): void => {
	if (hasActivePrivilege(entries, contribution, privilege)) return

	throwCapabilityConflict(
		`Plugin "${formatPluginIdentity(contribution.owner)}" must declare active privilege "${privilege}" for capability contribution "${contribution.declaration.contributionId}".`,
		{
			kind: 'capability-privilege-missing',
			plugin: formatPluginIdentity(contribution.owner),
			capabilityId: entry.token.capabilityId,
			contributionId: contribution.declaration.contributionId,
			privilege,
		},
	)
}

const buildReplacementChains = (
	entries: readonly MutableCapabilityEntry[],
	entry: MutableCapabilityEntry,
): readonly (readonly OwnedProvider[])[] => {
	assertUniqueContributionIds(entry)

	const replacementsByTarget = new Map<OwnedProvider, OwnedProvider>()
	for (const replacement of entry.replacements) {
		assertContributionPrivilege(
			entries,
			entry,
			replacement,
			'capability:replace',
		)
		const declaration =
			replacement.declaration as CapabilityReplacementDeclaration
		const target = findContribution(
			entry,
			declaration.target.owner,
			declaration.target.contributionId,
		)
		if (target === undefined) {
			const incompatibleTargets = entries
				.filter((candidate) => candidate !== entry)
				.flatMap((candidate) => {
					const contribution = findContribution(
						candidate,
						declaration.target.owner,
						declaration.target.contributionId,
					)
					return contribution === undefined
						? []
						: [{ entry: candidate, contribution }]
				})

			if (incompatibleTargets.length > 1) {
				return throwCapabilityConflict(
					`Capability replacement "${declaration.contributionId}" has an ambiguous target across incompatible protocol tokens.`,
					{
						kind: 'capability-replacement-target-ambiguous',
						capabilityId: entry.token.capabilityId,
						replacement: declaration.contributionId,
						targetOwner: formatPluginIdentity(declaration.target.owner),
						targetContributionId: declaration.target.contributionId,
					},
				)
			}

			const incompatible = incompatibleTargets[0]
			if (incompatible !== undefined) {
				throw new FrameworkError(
					'PLUGIN_PROTOCOL_INCOMPATIBLE',
					`Capability replacement "${declaration.contributionId}" uses "${entry.token.capabilityId}@${entry.token.version}" but its target contributes "${incompatible.entry.token.capabilityId}@${incompatible.entry.token.version}".`,
					{
						internalDetails: {
							kind: 'capability-replacement-version',
							replacement: declaration.contributionId,
							replacementCapabilityId: entry.token.capabilityId,
							replacementVersion: entry.token.version,
							targetCapabilityId: incompatible.entry.token.capabilityId,
							targetVersion: incompatible.entry.token.version,
						},
					},
				)
			}

			return throwCapabilityConflict(
				`Capability replacement "${declaration.contributionId}" targets a missing contribution "${declaration.target.contributionId}" owned by "${formatPluginIdentity(declaration.target.owner)}".`,
				{
					kind: 'capability-replacement-target-missing',
					capabilityId: entry.token.capabilityId,
					replacement: declaration.contributionId,
					targetOwner: formatPluginIdentity(declaration.target.owner),
					targetContributionId: declaration.target.contributionId,
				},
			)
		}
		if (replacementsByTarget.has(target)) {
			return throwCapabilityConflict(
				`Capability contribution "${target.declaration.contributionId}" has more than one direct replacement.`,
				{
					kind: 'capability-replacement-branch',
					capabilityId: entry.token.capabilityId,
					targetOwner: formatPluginIdentity(target.owner),
					targetContributionId: target.declaration.contributionId,
				},
			)
		}
		replacementsByTarget.set(target, replacement)
	}

	const chains = entry.providers.map((provider) => {
		const chain: OwnedProvider[] = []
		const visited = new Set<OwnedProvider>()
		let contribution: OwnedProvider | undefined = provider

		while (contribution !== undefined) {
			if (visited.has(contribution)) {
				throwCapabilityConflict(
					`Capability "${entry.token.capabilityId}" contains a replacement cycle.`,
					{
						kind: 'capability-replacement-cycle',
						capabilityId: entry.token.capabilityId,
					},
				)
			}
			visited.add(contribution)
			chain.push(contribution)
			contribution = replacementsByTarget.get(contribution)
		}

		return immutableArray(chain)
	})

	const reachable = new Set(chains.flat())
	if (entry.replacements.some((replacement) => !reachable.has(replacement))) {
		throwCapabilityConflict(
			`Capability "${entry.token.capabilityId}" contains a replacement cycle detached from any provider.`,
			{
				kind: 'capability-replacement-cycle',
				capabilityId: entry.token.capabilityId,
			},
		)
	}

	if (entry.token.cardinality === 'single' && chains.length > 1) {
		throwCapabilityConflict(
			`Single capability "${entry.token.capabilityId}" has ${String(chains.length)} competing providers.`,
			{
				kind: 'single-capability-provider-conflict',
				capabilityId: entry.token.capabilityId,
				providers: immutableArray(
					entry.providers.map(({ owner, declaration }) =>
						immutableRecord({
							owner: formatPluginIdentity(owner),
							contributionId: declaration.contributionId,
						}),
					),
				),
			},
		)
	}

	for (const decorator of entry.decorators) {
		assertContributionPrivilege(
			entries,
			entry,
			decorator,
			'capability:decorate',
		)
	}

	return immutableArray(chains)
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

		for (const plugin of plugins) {
			const owner = plugin.definition.manifest.identity
			const declarations = plugin.definition.manifest.capabilities

			for (const declaration of declarations.provides) {
				registerToken(
					entriesById,
					orderedEntries,
					owner,
					declaration.token,
				).providers.push({ kind: 'provider', owner, plugin, declaration })
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
				).requirements.push({ owner, requirement })
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

/** Supplies application materialization with final static contribution plans. */
export const readCapabilityPlans = (
	inventory: CapabilityInventory,
): readonly CapabilityPlan[] => getInventoryState(inventory).plans
