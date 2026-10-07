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
import { capabilityFamilyRule } from './capability-rules.js'
import {
	assertNormalizedPlugin,
	type NormalizedPlugin,
} from './normalization.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	snapshotPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'
import { isAdapterCapability } from '../runtime/adapters/capabilities.js'
import { isAdapterContributionCapability } from '../runtime/adapters/contributions.js'
import {
	canonicalApplicationRequestExecutionFoundation,
	isApplicationRequestExecutionCapability,
} from '../runtime/application/application-request-execution.js'
import {
	canonicalApplicationOperationTransportPlanningFoundation,
	isApplicationOperationTransportPlanningCapability,
} from '../runtime/application/application-operation-transport-planning.js'
import {
	canonicalApplicationSchemaMutationSurfaceFoundation,
	isApplicationSchemaMutationSurfaceCapability,
} from '../runtime/application/application-schema-mutation-surface.js'

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

/** Retains one provider with its owner; Core foundations have no plugin. */
export interface OwnedProvider {
	readonly owner: PluginIdentity
	readonly plugin?: NormalizedPlugin
	readonly version: string
	readonly declaration: CapabilityProviderDeclaration
}

interface OwnedRequirement {
	readonly owner: PluginIdentity
	readonly plugin: NormalizedPlugin
	readonly requirement: CapabilityRequirement
}

interface CapabilityPlan {
	readonly token: CapabilityToken
	readonly firstOwner: PluginIdentity
	readonly providers: OwnedProvider[]
	readonly requirements: OwnedRequirement[]
}

interface CapabilityInventoryState {
	readonly plansByToken: ReadonlyMap<CapabilityToken, CapabilityPlan>
	readonly declarationConsumers: Map<CapabilityToken, unknown>
}

const inventoryStates = new WeakMap<
	CapabilityInventory,
	CapabilityInventoryState
>()

const coreFoundations = [
	canonicalApplicationRequestExecutionFoundation,
	canonicalApplicationOperationTransportPlanningFoundation,
	canonicalApplicationSchemaMutationSurfaceFoundation,
]

/** Names Core-owned execution protocols that plugins may consume but never provide. */
const coreCapabilityDescription = (
	token: CapabilityToken,
): Readonly<{ readonly kind: string; readonly name: string }> | undefined => {
	if (isApplicationRequestExecutionCapability(token)) {
		return {
			kind: 'application-request',
			name: 'Application request execution',
		}
	}
	if (isApplicationOperationTransportPlanningCapability(token)) {
		return {
			kind: 'application-operation-transport-planning',
			name: 'Application operation transport planning',
		}
	}
	if (isApplicationSchemaMutationSurfaceCapability(token)) {
		return {
			kind: 'application-schema-mutation-surface',
			name: 'Application schema mutation surface',
		}
	}
	return undefined
}

const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
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

/** Validates one token's providers against every ownership and privilege rule. */
const validatePlan = (
	plans: ReadonlyMap<CapabilityToken, CapabilityPlan>,
	plan: CapabilityPlan,
): void => {
	const { token } = plan
	// A conditional request is active only when its optional protocol has a provider.
	const isConditionActive = (
		owner: PluginIdentity,
		when: CapabilityRequirement,
	): boolean => {
		const condition = plans.get(when.token)
		return (
			condition !== undefined &&
			condition.providers.length > 0 &&
			condition.requirements.some(
				(candidate) =>
					candidate.requirement === when &&
					isSamePluginIdentity(candidate.owner, owner),
			)
		)
	}
	const hasActivePrivilege = (
		{ owner, plugin }: OwnedProvider | OwnedRequirement,
		privilege: PluginPrivilege,
	): boolean =>
		plugin?.definition.manifest.privileges.some(
			({ name, when }) =>
				name === privilege &&
				(when === undefined || isConditionActive(owner, when)),
		) ?? false
	const assertProviderPrivilege = (
		provider: OwnedProvider,
		privilege: PluginPrivilege,
	): void => {
		if (hasActivePrivilege(provider, privilege)) return
		throwCapabilityConflict(
			`Plugin "${formatPluginIdentity(provider.owner)}" must declare active privilege "${privilege}" for capability contribution "${provider.declaration.contributionId}".`,
			{
				kind: 'capability-privilege-missing',
				plugin: formatPluginIdentity(provider.owner),
				capabilityId: token.capabilityId,
				contributionId: provider.declaration.contributionId,
				privilege,
			},
		)
	}

	for (const [index, provider] of plan.providers.entries()) {
		const duplicate = plan.providers
			.slice(index + 1)
			.some(
				(candidate) =>
					candidate.declaration.contributionId ===
						provider.declaration.contributionId &&
					isSamePluginIdentity(candidate.owner, provider.owner),
			)
		if (duplicate) {
			throwCapabilityConflict(
				`Plugin "${formatPluginIdentity(provider.owner)}" declares duplicate contribution "${provider.declaration.contributionId}" for capability "${token.capabilityId}".`,
				{
					kind: 'duplicate-capability-contribution',
					plugin: formatPluginIdentity(provider.owner),
					capabilityId: token.capabilityId,
					contributionId: provider.declaration.contributionId,
				},
			)
		}
	}
	if (token.providerPrivilege !== undefined) {
		for (const provider of plan.providers) {
			assertProviderPrivilege(provider, token.providerPrivilege)
		}
	}

	const rule = capabilityFamilyRule(token)
	const requirementRule = rule?.requirement
	for (const requirement of plan.requirements) {
		if (requirementRule === undefined) break
		const plugin = formatPluginIdentity(requirement.owner)
		if ('forbidden' in requirementRule) {
			throwCapabilityConflict(requirementRule.forbidden, {
				kind: requirementRule.kind,
				plugin,
				capabilityId: token.capabilityId,
			})
		} else if (!hasActivePrivilege(requirement, requirementRule.privilege)) {
			throwCapabilityConflict(
				`Plugin "${plugin}" must declare active privilege "${requirementRule.privilege}" ${requirementRule.purpose}.`,
				{
					kind: requirementRule.kind,
					plugin,
					capabilityId: token.capabilityId,
					privilege: requirementRule.privilege,
				},
			)
		}
	}

	const core = coreCapabilityDescription(token)
	const providerRule =
		core === undefined
			? rule?.provider
			: {
					authorized: () => false,
					kind: `${core.kind}-provider-forbidden`,
					message: `${core.name} is provided only by Core.`,
					reportsCapability: false,
				}
	for (const provider of plan.providers) {
		// Core foundations satisfy their own protocols before plugins are inspected.
		if (providerRule === undefined || provider.plugin === undefined) continue
		if (!providerRule.authorized(provider.declaration)) {
			throwCapabilityConflict(providerRule.message, {
				kind: providerRule.kind,
				plugin: formatPluginIdentity(provider.owner),
				...(providerRule.reportsCapability
					? { capabilityId: token.capabilityId }
					: {}),
				contributionId: provider.declaration.contributionId,
			})
		}
		if (providerRule.privilege !== undefined) {
			assertProviderPrivilege(provider, providerRule.privilege)
		}
	}

	if (token.cardinality === 'single' && plan.providers.length > 1) {
		throwCapabilityConflict(
			`Single capability "${token.capabilityId}" has ${String(plan.providers.length)} competing providers.`,
			{
				kind: 'single-capability-provider-conflict',
				capabilityId: token.capabilityId,
				providers: immutableArray(
					plan.providers.map(({ owner, declaration }) =>
						immutableRecord({
							owner: formatPluginIdentity(owner),
							contributionId: declaration.contributionId,
						}),
					),
				),
			},
		)
	}
}

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

		const plans = new Map<CapabilityToken, CapabilityPlan>()
		const plansById = new Map<string, CapabilityPlan>()
		const planFor = (
			owner: PluginIdentity,
			token: CapabilityToken,
		): CapabilityPlan => {
			const key = `${token.capabilityId}@${token.version}`
			const existing = plansById.get(key)
			if (existing !== undefined) {
				if (existing.token === token) return existing
				return throwCapabilityConflict(
					`Capability "${token.capabilityId}@${token.version}" uses distinct nominal tokens in plugins "${formatPluginIdentity(existing.firstOwner)}" and "${formatPluginIdentity(owner)}".`,
					{
						kind: 'duplicate-capability-token',
						capabilityId: token.capabilityId,
						version: token.version,
						firstOwner: formatPluginIdentity(existing.firstOwner),
						secondOwner: formatPluginIdentity(owner),
					},
				)
			}
			const plan = { token, firstOwner: owner, providers: [], requirements: [] }
			plansById.set(key, plan)
			plans.set(token, plan)
			return plan
		}

		// One requirement inventory selects only the Core foundations a plugin consumes.
		const consumedTokens = new Set(
			plugins.flatMap(({ definition }) =>
				[
					...definition.manifest.capabilities.requires,
					...definition.manifest.capabilities.optional,
				].map(({ token }) => token),
			),
		)
		for (const foundation of coreFoundations) {
			const { owner, version, declaration } = foundation
			if (!consumedTokens.has(declaration.token)) continue
			planFor(owner, declaration.token).providers.push({
				owner,
				version,
				declaration,
			})
		}

		for (const plugin of plugins) {
			const {
				identity: owner,
				version,
				capabilities,
			} = plugin.definition.manifest
			for (const declaration of capabilities.provides) {
				planFor(owner, declaration.token).providers.push({
					owner,
					plugin,
					version,
					declaration,
				})
			}
			for (const requirement of [
				...capabilities.requires,
				...capabilities.optional,
			]) {
				planFor(owner, requirement.token).requirements.push({
					owner,
					plugin,
					requirement,
				})
			}
		}

		for (const plan of plans.values()) validatePlan(plans, plan)

		this.entries = immutableArray(
			[...plans.values()].map((plan) => {
				const active = plan.providers.length > 0
				for (const { owner, requirement } of plan.requirements) {
					if (!requirement.optional && !active) {
						throwMissingCapability(owner, requirement)
					}
				}

				return immutableRecord({
					token: plan.token,
					providers: immutableArray(
						plan.providers.map(({ owner, declaration }) =>
							immutableRecord({
								kind: 'provider' as const,
								owner: snapshotPluginIdentity(owner),
								contributionId: declaration.contributionId,
							}),
						),
					),
					requirements: immutableArray(
						plan.requirements.map(({ owner, requirement }) =>
							immutableRecord({ owner, requirement, active }),
						),
					),
				})
			}),
		)

		inventoryStates.set(this, {
			plansByToken: plans,
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

/** Finds one plugin's privilege request only while its capability condition holds. */
export const findActivePrivilegeRequest = (
	inventory: CapabilityInventory,
	plugin: NormalizedPlugin | undefined,
	privilege: PluginPrivilege,
): PluginPrivilegeRequest | undefined =>
	plugin?.definition.manifest.privileges.find(
		(request) =>
			request.name === privilege &&
			inventory.isPrivilegeActive(plugin.definition.manifest.identity, request),
	)

/** Executes pure declaration composition only after privilege policy succeeds. */
export const composeDeclarationCapabilities = (
	inventory: CapabilityInventory,
): void => {
	const state = getInventoryState(inventory)
	for (const { token, providers } of state.plansByToken.values()) {
		if (token.lifetime !== 'declaration') continue
		// An absent optional capability has no consumer view. In particular, a
		// single-capability composer must never receive an impossible empty tuple.
		if (providers.length === 0) continue

		const values = providers.map(({ declaration }) => {
			if (!('value' in declaration)) {
				throw new TypeError('Declaration capability contribution has no value')
			}
			return declaration.value
		})
		const consumer: unknown = composeCapability(token, values)
		state.declarationConsumers.set(token, consumer)
	}
}

/** Reads one already composed declaration consumer for an exact requirement. */
export const readDeclarationCapability = (
	inventory: CapabilityInventory,
	requirement: CapabilityRequirement,
): unknown =>
	getInventoryState(inventory).declarationConsumers.get(requirement.token)

/** Supplies application materialization with final static provider plans. */
export const readCapabilityPlans = (
	inventory: CapabilityInventory,
): ReadonlyMap<
	CapabilityToken,
	Readonly<{ providers: readonly OwnedProvider[] }>
> => getInventoryState(inventory).plansByToken
