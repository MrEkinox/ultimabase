import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type {
	CapabilityReplacementDeclaration,
	CapabilityRequirement,
} from './capabilities.js'
import type {
	MutableCapabilityEntry,
	OwnedDecorator,
	OwnedProvider,
} from './capability-inventory.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import {
	isSchemaCompilerCapability,
	isSchemaCompilerReplacement,
} from './schema-compiler-ir/schema-compiler-capability.js'

const throwCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
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
	contribution: OwnedProvider | OwnedDecorator,
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

/** Builds exact replacement chains and enforces their privilege boundaries. */
export const buildReplacementChains = (
	entries: readonly MutableCapabilityEntry[],
	entry: MutableCapabilityEntry,
): readonly (readonly OwnedProvider[])[] => {
	assertUniqueContributionIds(entry)

	const replacementsByTarget = new Map<OwnedProvider, OwnedProvider>()
	for (const replacement of entry.replacements) {
		if (
			isSchemaCompilerCapability(entry.token) &&
			!isSchemaCompilerReplacement(
				replacement.declaration as CapabilityReplacementDeclaration,
			)
		) {
			return throwCapabilityConflict(
				'Schema compiler replacements must be created by replaceSchemaCompiler.',
				{
					kind: 'schema-compiler-replacement-factory',
					plugin: formatPluginIdentity(replacement.owner),
					contributionId: replacement.declaration.contributionId,
				},
			)
		}
		assertContributionPrivilege(
			entries,
			entry,
			replacement,
			isSchemaCompilerCapability(entry.token)
				? 'schema:replace'
				: 'capability:replace',
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
		if (isSchemaCompilerCapability(entry.token)) {
			return throwCapabilityConflict(
				'Schema compiler capability cannot be decorated.',
				{
					kind: 'schema-compiler-decoration-forbidden',
					plugin: formatPluginIdentity(decorator.owner),
					contributionId: decorator.declaration.contributionId,
				},
			)
		}
		assertContributionPrivilege(
			entries,
			entry,
			decorator,
			'capability:decorate',
		)
	}

	return immutableArray(chains)
}
