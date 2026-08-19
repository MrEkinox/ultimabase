import { FrameworkError } from '../errors/framework-error.js'
import {
	adapterCapabilityPrivilege,
	isAdapterCapability,
	isAuthorizedAdapterCapabilityProvider,
} from '../runtime/adapters/capabilities.js'
import {
	adapterContributionPrivileges,
	isAuthorizedAdapterContributionProvider,
} from '../runtime/adapters/contributions.js'
import type { CapabilityProviderDeclaration } from './capabilities.js'
import type {
	MutableCapabilityEntry,
	OwnedDecorator,
	OwnedProvider,
} from './capability-inventory.js'
import { formatPluginIdentity, type PluginPrivilege } from './manifest.js'

type OwnedRequirement = MutableCapabilityEntry['requirements'][number]

interface AdapterCapabilityPlanningAccess {
	readonly assertProviderPrivilege: (
		provider: OwnedProvider,
		privilege: PluginPrivilege,
	) => void
	readonly hasActivePrivilege: (
		requirement: OwnedRequirement,
		privilege: PluginPrivilege,
	) => boolean
}

const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
}

/** @internal Enforces the exact helpers and privileges of adapter protocols. */
export const validateAdapterCapabilityEntry = (
	entry: MutableCapabilityEntry,
	access: AdapterCapabilityPlanningAccess,
): void => {
	const adapterPrivilege = adapterCapabilityPrivilege(entry.token)
	if (adapterPrivilege !== undefined) {
		for (const requirement of entry.requirements) {
			if (access.hasActivePrivilege(requirement, adapterPrivilege)) continue
			throwCapabilityConflict(
				`Plugin "${formatPluginIdentity(requirement.owner)}" must declare active privilege "${adapterPrivilege}" to require adapter capability "${entry.token.capabilityId}".`,
				{
					kind: 'adapter-capability-requirement-privilege-missing',
					plugin: formatPluginIdentity(requirement.owner),
					capabilityId: entry.token.capabilityId,
					privilege: adapterPrivilege,
				},
			)
		}
		for (const provider of entry.providers) {
			if (
				isAuthorizedAdapterCapabilityProvider(
					provider.declaration as CapabilityProviderDeclaration,
				)
			) {
				continue
			}
			throwCapabilityConflict(
				`Adapter capability providers for "${entry.token.capabilityId}" must use its exact public helper.`,
				{
					kind: 'adapter-capability-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					capabilityId: entry.token.capabilityId,
					contributionId: provider.declaration.contributionId,
				},
			)
		}
	}

	const privileges = adapterContributionPrivileges(entry.token)
	if (privileges === undefined) return
	for (const requirement of entry.requirements) {
		if (access.hasActivePrivilege(requirement, privileges.consumer)) continue
		throwCapabilityConflict(
			`Plugin "${formatPluginIdentity(requirement.owner)}" must declare active privilege "${privileges.consumer}" to consume adapter contributions.`,
			{
				kind: 'adapter-contribution-consumer-privilege-missing',
				plugin: formatPluginIdentity(requirement.owner),
				capabilityId: entry.token.capabilityId,
				privilege: privileges.consumer,
			},
		)
	}
	for (const provider of entry.providers) {
		if (
			!isAuthorizedAdapterContributionProvider(
				provider.declaration as CapabilityProviderDeclaration,
			)
		) {
			throwCapabilityConflict(
				'Adapter contributions must use provideAdapterContribution.',
				{
					kind: 'adapter-contribution-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					capabilityId: entry.token.capabilityId,
					contributionId: provider.declaration.contributionId,
				},
			)
		}
		access.assertProviderPrivilege(provider, privileges.provider)
	}
}

const isProtectedAdapterEntry = (entry: MutableCapabilityEntry): boolean =>
	isAdapterCapability(entry.token) ||
	adapterContributionPrivileges(entry.token) !== undefined

/** @internal Rejects generic replacement for fixed adapter bridge protocols. */
export const assertAdapterReplacementAllowed = (
	entry: MutableCapabilityEntry,
	replacement: OwnedProvider,
): void => {
	if (!isProtectedAdapterEntry(entry)) return
	throwCapabilityConflict(
		'Adapter capabilities cannot use generic capability replacement.',
		{
			kind: 'adapter-capability-replacement-forbidden',
			plugin: formatPluginIdentity(replacement.owner),
			capabilityId: entry.token.capabilityId,
			contributionId: replacement.declaration.contributionId,
		},
	)
}

/** @internal Rejects generic decoration for fixed adapter bridge protocols. */
export const assertAdapterDecorationAllowed = (
	entry: MutableCapabilityEntry,
	decorator: OwnedDecorator,
): void => {
	if (!isProtectedAdapterEntry(entry)) return
	throwCapabilityConflict(
		'Adapter capabilities cannot use generic capability decoration.',
		{
			kind: 'adapter-capability-decoration-forbidden',
			plugin: formatPluginIdentity(decorator.owner),
			capabilityId: entry.token.capabilityId,
			contributionId: decorator.declaration.contributionId,
		},
	)
}
