import type {
	ApplicationCallbackExecutor,
	CapabilityProviderContribution,
	CapabilityRequirement,
	CompiledSchemaRegistry,
	PluginCapabilityReader,
	RequestPrincipalResolver,
	RequestRoleResolver,
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { createACLApplicationState } from './application-state.js'
import type { NormalizedACLSchemaOption } from './acl-option.js'
import type { ResolvedACLEntryLimits } from './acl-limits.js'

type PrincipalResolverContribution = CapabilityProviderContribution<
	typeof requestPrincipalResolverCapability
>
type RoleResolverContribution = CapabilityProviderContribution<
	typeof requestRoleResolverCapability
>

/** Retains the exact principal provider owner when ACL consumes its callbacks. */
export const attributePrincipalResolver = (
	contribution: PrincipalResolverContribution | undefined,
	callbacks: ApplicationCallbackExecutor,
): RequestPrincipalResolver | undefined =>
	contribution === undefined
		? undefined
		: immutableRecord({
				resolveCurrent: (input) =>
					callbacks.runPlugin(contribution.owner, () =>
						contribution.value.resolveCurrent(input),
					),
			})

/** Retains the exact role provider owner across every optional resolver method. */
export const attributeRoleResolver = (
	contribution: RoleResolverContribution | undefined,
	callbacks: ApplicationCallbackExecutor,
): RequestRoleResolver | undefined => {
	if (contribution === undefined) return undefined
	const resolver = contribution.value
	const resolveCurrentRoles = resolver.resolveCurrentRoles?.bind(resolver)
	const resolvePersistentRole = resolver.resolvePersistentRole?.bind(resolver)

	return immutableRecord({
		hasRole: (input) =>
			callbacks.runPlugin(contribution.owner, () => resolver.hasRole(input)),
		...(resolveCurrentRoles === undefined
			? {}
			: {
					resolveCurrentRoles: (input) =>
						callbacks.runPlugin(contribution.owner, () =>
							resolveCurrentRoles(input),
						),
				}),
		...(resolvePersistentRole === undefined
			? {}
			: {
					resolvePersistentRole: (input) =>
						callbacks.runPlugin(contribution.owner, () =>
							resolvePersistentRole(input),
						),
				}),
	})
}

interface ACLApplicationStateReaderOptions {
	readonly hasStaticRoleGrant: (config: NormalizedACLSchemaOption) => boolean
	readonly pluginLimits: ResolvedACLEntryLimits
	readonly principalRequirement: CapabilityRequirement<
		typeof requestPrincipalResolverCapability,
		true
	>
	readonly readMutationItems: Parameters<
		typeof createACLApplicationState
	>[0]['readMutationItems']
	readonly readProtectedSchemas: (
		schemas: CompiledSchemaRegistry,
	) => readonly Parameters<
		typeof createACLApplicationState
	>[0]['protectedSchemas'][number][]
	readonly roleRequirement: CapabilityRequirement<
		typeof requestRoleResolverCapability,
		true
	>
	readonly snapshotACL: Parameters<
		typeof createACLApplicationState
	>[0]['snapshotACL']
}

/** Creates one cached state reader while preserving resolver contribution owners. */
export const createAttributedACLApplicationStateReader = (
	options: ACLApplicationStateReaderOptions,
): ((
	schemas: CompiledSchemaRegistry,
	capabilities: PluginCapabilityReader,
	callbacks: ApplicationCallbackExecutor,
) => ReturnType<typeof createACLApplicationState>) => {
	const states = new WeakMap<
		object,
		ReturnType<typeof createACLApplicationState>
	>()

	return (schemas, capabilities, callbacks) => {
		const existing = states.get(schemas)
		if (existing !== undefined) return existing
		const state = createACLApplicationState({
			hasStaticRoleGrant: options.hasStaticRoleGrant,
			pluginLimits: options.pluginLimits,
			principalResolver: attributePrincipalResolver(
				capabilities.contributions(options.principalRequirement)[0],
				callbacks,
			),
			protectedSchemas: options.readProtectedSchemas(schemas),
			readMutationItems: options.readMutationItems,
			roleResolver: attributeRoleResolver(
				capabilities.contributions(options.roleRequirement)[0],
				callbacks,
			),
			schemas,
			snapshotACL: options.snapshotACL,
		})
		states.set(schemas, state)
		return state
	}
}
