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

/** Forbids plugin requirements from consuming one protected protocol family. */
export type CapabilityRequirementRule = Readonly<{
	readonly forbidden: string
	readonly kind: string
}>

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
 * Resolves the protected family of one token. Runtime and persistence-rewriter
 * families are disjoint by construction.
 */
export const capabilityFamilyRule = (
	token: CapabilityToken,
): CapabilityFamilyRule | undefined => {
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
	// Protected requirements are forbidden outright, so only providers imply privileges.
	const privileges =
		declaration.kind === 'capability-provider'
			? [declaration.token.providerPrivilege, rule?.provider?.privilege]
			: []
	return privileges.filter((privilege) => privilege !== undefined)
}
