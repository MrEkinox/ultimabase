import {
	adapterCapabilityPrivilege,
	isAuthorizedAdapterCapabilityProvider,
} from '../runtime/adapters/capabilities.js'
import {
	adapterContributionPrivileges,
	isAuthorizedAdapterContributionProvider,
} from '../runtime/adapters/contributions.js'
import {
	isAuthorizedRuntimeProvider,
	runtimeProviderPrivilege,
} from '../runtime/capabilities.js'
import {
	isAuthorizedPersistencePlanRewriterProvider,
	persistencePlanRewriterCapability,
} from '../runtime/persistence/capabilities.js'
import type {
	CapabilityProviderDeclaration,
	CapabilityToken,
	PluginCapabilityDeclaration,
} from './capabilities.js'
import type { PluginPrivilege } from './manifest.js'

/** Describes how plugin requirements may consume one protected protocol family. */
export type CapabilityRequirementRule =
	| Readonly<{
			readonly kind: string
			readonly privilege: PluginPrivilege
			/** Completes "must declare active privilege ... <purpose>." */
			readonly purpose: string
	  }>
	| Readonly<{ readonly forbidden: string; readonly kind: string }>

/** Describes the exact public helper and power required from each provider. */
export interface CapabilityProviderRule {
	readonly authorized: (declaration: CapabilityProviderDeclaration) => boolean
	readonly kind: string
	readonly message: string
	readonly privilege?: PluginPrivilege
	/** Omits the capability identity from diagnostics that name a fixed protocol. */
	readonly reportsCapability: boolean
}

/** Collects the Core-owned constraints of one protected capability family. */
export interface CapabilityFamilyRule {
	readonly provider?: CapabilityProviderRule
	readonly requirement?: CapabilityRequirementRule
}

/**
 * Resolves the protected family of one token. Adapter, contribution, Runtime
 * and persistence-rewriter families are disjoint by construction.
 */
export const capabilityFamilyRule = (
	token: CapabilityToken,
): CapabilityFamilyRule | undefined => {
	const adapterPrivilege = adapterCapabilityPrivilege(token)
	if (adapterPrivilege !== undefined) {
		return {
			requirement: {
				kind: 'adapter-capability-requirement-privilege-missing',
				privilege: adapterPrivilege,
				purpose: `to require adapter capability "${token.capabilityId}"`,
			},
			provider: {
				authorized: isAuthorizedAdapterCapabilityProvider,
				kind: 'adapter-capability-provider-factory',
				message: `Adapter capability providers for "${token.capabilityId}" must use its exact public helper.`,
				reportsCapability: true,
			},
		}
	}
	const contribution = adapterContributionPrivileges(token)
	if (contribution !== undefined) {
		return {
			requirement: {
				kind: 'adapter-contribution-consumer-privilege-missing',
				privilege: contribution.consumer,
				purpose: 'to consume adapter contributions',
			},
			provider: {
				authorized: isAuthorizedAdapterContributionProvider,
				kind: 'adapter-contribution-provider-factory',
				message: 'Adapter contributions must use provideAdapterContribution.',
				privilege: contribution.provider,
				reportsCapability: true,
			},
		}
	}
	const runtimePrivilege = runtimeProviderPrivilege(token)
	if (runtimePrivilege !== undefined) {
		return {
			requirement: {
				forbidden: `Core Runtime capability "${token.capabilityId}" cannot be consumed through a plugin requirement.`,
				kind: 'runtime-capability-requirement-forbidden',
			},
			provider: {
				authorized: isAuthorizedRuntimeProvider,
				kind: 'runtime-capability-provider-factory',
				message: `Runtime capability providers for "${token.capabilityId}" must use its exact public helper.`,
				privilege: runtimePrivilege,
				reportsCapability: true,
			},
		}
	}
	if (token === persistencePlanRewriterCapability) {
		return {
			requirement: {
				forbidden:
					'Persistence plan rewriters cannot be consumed through a plugin requirement.',
				kind: 'persistence-rewriter-requirement-forbidden',
			},
			provider: {
				authorized: isAuthorizedPersistencePlanRewriterProvider,
				kind: 'persistence-rewriter-provider-factory',
				message:
					'Persistence plan rewriters must use providePersistencePlanRewriter.',
				privilege: 'persistence:rewrite',
				reportsCapability: false,
			},
		}
	}
	return undefined
}

/** Lists the privileges one capability declaration implies, in enforcement order. */
export const capabilityDeclarationPrivileges = (
	declaration: PluginCapabilityDeclaration,
): readonly PluginPrivilege[] => {
	const rule = capabilityFamilyRule(declaration.token)
	const privileges =
		declaration.kind === 'capability-provider'
			? [declaration.token.providerPrivilege, rule?.provider?.privilege]
			: [
					rule?.requirement !== undefined && 'privilege' in rule.requirement
						? rule.requirement.privilege
						: undefined,
				]
	return privileges.filter((privilege) => privilege !== undefined)
}
