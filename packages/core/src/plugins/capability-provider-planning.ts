import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { CapabilityRequirement } from './capabilities.js'
import type {
	MutableCapabilityEntry,
	OwnedProvider,
} from './capability-inventory.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import {
	isAuthorizedRuntimeProvider,
	isRuntimeCapability,
	runtimeProviderPrivilege,
} from '../runtime/capabilities.js'
import {
	isAuthorizedPersistencePlanRewriterProvider,
	persistencePlanRewriterCapability,
} from '../runtime/persistence/capabilities.js'
import { assertCoreCapabilityProviders } from './core-capability-planning.js'
import { validateAdapterCapabilityEntry } from './adapter-capability-planning.js'

const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
}

const assertUniqueContributionIds = (entry: MutableCapabilityEntry): void => {
	const contributions = entry.providers

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
	contribution: OwnedProvider | MutableCapabilityEntry['requirements'][number],
	privilege: PluginPrivilege,
): boolean =>
	contribution.plugin?.definition.manifest.privileges.some(
		(request) =>
			request.name === privilege &&
			(request.when === undefined ||
				isRequirementActiveInEntries(
					entries,
					contribution.owner,
					request.when,
				)),
	) ?? false

const assertContributionPrivilege = (
	entries: readonly MutableCapabilityEntry[],
	entry: MutableCapabilityEntry,
	contribution: OwnedProvider,
	privilege: PluginPrivilege,
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

/** Validates ordered providers without weakening ownership or privilege checks. */
export const planCapabilityProviders = (
	entries: readonly MutableCapabilityEntry[],
	entry: MutableCapabilityEntry,
): readonly OwnedProvider[] => {
	assertUniqueContributionIds(entry)
	if (entry.token.providerPrivilege !== undefined) {
		for (const provider of entry.providers) {
			assertContributionPrivilege(
				entries,
				entry,
				provider,
				entry.token.providerPrivilege,
			)
		}
	}
	validateAdapterCapabilityEntry(entry, {
		assertProviderPrivilege: (provider, privilege) => {
			assertContributionPrivilege(entries, entry, provider, privilege)
		},
		hasActivePrivilege: (requirement, privilege) =>
			hasActivePrivilege(entries, requirement, privilege),
	})

	assertCoreCapabilityProviders(entry)

	const runtimeRequirement = isRuntimeCapability(entry.token)
		? entry.requirements[0]
		: undefined
	if (runtimeRequirement !== undefined) {
		return throwCapabilityConflict(
			`Core Runtime capability "${entry.token.capabilityId}" cannot be consumed through a plugin requirement.`,
			{
				kind: 'runtime-capability-requirement-forbidden',
				plugin: formatPluginIdentity(runtimeRequirement.owner),
				capabilityId: entry.token.capabilityId,
			},
		)
	}
	const persistenceRequirement =
		entry.token === persistencePlanRewriterCapability
			? entry.requirements[0]
			: undefined
	if (persistenceRequirement !== undefined) {
		return throwCapabilityConflict(
			'Persistence plan rewriters cannot be consumed through a plugin requirement.',
			{
				kind: 'persistence-rewriter-requirement-forbidden',
				plugin: formatPluginIdentity(persistenceRequirement.owner),
				capabilityId: entry.token.capabilityId,
			},
		)
	}
	if (entry.token === persistencePlanRewriterCapability) {
		for (const provider of entry.providers) {
			if (!isAuthorizedPersistencePlanRewriterProvider(provider.declaration)) {
				return throwCapabilityConflict(
					'Persistence plan rewriters must use providePersistencePlanRewriter.',
					{
						kind: 'persistence-rewriter-provider-factory',
						plugin: formatPluginIdentity(provider.owner),
						contributionId: provider.declaration.contributionId,
					},
				)
			}
			assertContributionPrivilege(
				entries,
				entry,
				provider,
				'persistence:rewrite',
			)
		}
	}
	const runtimeProviderPower = runtimeProviderPrivilege(entry.token)
	if (runtimeProviderPower !== undefined) {
		for (const provider of entry.providers) {
			if (provider.plugin === undefined) continue
			if (!isAuthorizedRuntimeProvider(provider.declaration)) {
				return throwCapabilityConflict(
					`Runtime capability providers for "${entry.token.capabilityId}" must use its exact public helper.`,
					{
						kind: 'runtime-capability-provider-factory',
						plugin: formatPluginIdentity(provider.owner),
						capabilityId: entry.token.capabilityId,
						contributionId: provider.declaration.contributionId,
					},
				)
			}
			assertContributionPrivilege(
				entries,
				entry,
				provider,
				runtimeProviderPower,
			)
		}
	}
	if (entry.token.cardinality === 'single' && entry.providers.length > 1) {
		throwCapabilityConflict(
			`Single capability "${entry.token.capabilityId}" has ${String(entry.providers.length)} competing providers.`,
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

	return immutableArray(entry.providers)
}
