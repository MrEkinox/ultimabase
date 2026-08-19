import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type {
	CapabilityProviderDeclaration,
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
import {
	isAuthorizedRuntimeProvider,
	isRuntimeCapability,
	isRuntimeReplacement,
	runtimeExecutorCapability,
	runtimeProviderPrivilege,
} from '../runtime/capabilities.js'
import {
	isAuthorizedPersistencePlanRewriterProvider,
	persistencePlanRewriterCapability,
} from '../runtime/persistence/capabilities.js'
import {
	isAuthorizedOperationTransportBindingProvider,
	isAuthorizedPluginOperationProvider,
	operationTransportBindingCapability,
	pluginOperationHandlerCapability,
} from '../runtime/plugin-operations/capabilities.js'

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
			if (
				!isAuthorizedPersistencePlanRewriterProvider(
					provider.declaration as CapabilityProviderDeclaration,
				)
			) {
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
	const isPluginOperationProtocol =
		entry.token === pluginOperationHandlerCapability ||
		entry.token === operationTransportBindingCapability
	if (isPluginOperationProtocol && entry.requirements.length > 0) {
		const [requirement] = entry.requirements
		return throwCapabilityConflict(
			'Plugin operation protocols cannot be consumed through a capability requirement.',
			{
				kind: 'plugin-operation-requirement-forbidden',
				plugin:
					requirement === undefined
						? 'unknown'
						: formatPluginIdentity(requirement.owner),
				capabilityId: entry.token.capabilityId,
			},
		)
	}
	if (entry.token === pluginOperationHandlerCapability) {
		for (const provider of entry.providers) {
			if (
				!isAuthorizedPluginOperationProvider(
					provider.declaration as CapabilityProviderDeclaration,
				)
			) {
				return throwCapabilityConflict(
					'Plugin operation handlers must use provideOperationHandler.',
					{
						kind: 'plugin-operation-provider-factory',
						plugin: formatPluginIdentity(provider.owner),
						contributionId: provider.declaration.contributionId,
					},
				)
			}
		}
	}
	if (entry.token === operationTransportBindingCapability) {
		for (const provider of entry.providers) {
			if (
				!isAuthorizedOperationTransportBindingProvider(
					provider.declaration as CapabilityProviderDeclaration,
				)
			) {
				return throwCapabilityConflict(
					'Operation transport bindings must use provideOperationTransportBinding.',
					{
						kind: 'operation-transport-provider-factory',
						plugin: formatPluginIdentity(provider.owner),
						contributionId: provider.declaration.contributionId,
					},
				)
			}
			assertContributionPrivilege(entries, entry, provider, 'transport:expose')
		}
	}

	const runtimeProviderPower = runtimeProviderPrivilege(entry.token)
	if (runtimeProviderPower !== undefined) {
		for (const provider of entry.providers) {
			if (provider.plugin === undefined) continue
			if (
				!isAuthorizedRuntimeProvider(
					provider.declaration as CapabilityProviderDeclaration,
				)
			) {
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
	if (entry.token === runtimeExecutorCapability) {
		const pluginProvider = entry.providers.find(
			(provider) => provider.plugin !== undefined,
		)
		if (pluginProvider !== undefined) {
			return throwCapabilityConflict(
				'Plugins must replace the canonical Runtime executor through replaceRuntime.',
				{
					kind: 'runtime-executor-provider-forbidden',
					plugin: formatPluginIdentity(pluginProvider.owner),
					contributionId: pluginProvider.declaration.contributionId,
				},
			)
		}
	}

	const replacementsByTarget = new Map<OwnedProvider, OwnedProvider>()
	for (const replacement of entry.replacements) {
		if (isPluginOperationProtocol) {
			return throwCapabilityConflict(
				'Plugin operation protocols cannot use generic capability replacement.',
				{
					kind: 'plugin-operation-replacement-forbidden',
					plugin: formatPluginIdentity(replacement.owner),
					contributionId: replacement.declaration.contributionId,
				},
			)
		}
		if (entry.token === persistencePlanRewriterCapability) {
			return throwCapabilityConflict(
				'Persistence plan rewriters cannot be replaced through the generic capability facade.',
				{
					kind: 'persistence-rewriter-replacement-forbidden',
					plugin: formatPluginIdentity(replacement.owner),
					contributionId: replacement.declaration.contributionId,
				},
			)
		}
		if (
			isRuntimeCapability(entry.token) &&
			entry.token !== runtimeExecutorCapability
		) {
			return throwCapabilityConflict(
				`Core Runtime capability "${entry.token.capabilityId}" cannot be replaced.`,
				{
					kind: 'runtime-capability-replacement-forbidden',
					plugin: formatPluginIdentity(replacement.owner),
					capabilityId: entry.token.capabilityId,
					contributionId: replacement.declaration.contributionId,
				},
			)
		}
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
		if (
			entry.token === runtimeExecutorCapability &&
			!isRuntimeReplacement(
				replacement.declaration as CapabilityReplacementDeclaration,
			)
		) {
			return throwCapabilityConflict(
				'Runtime executor replacements must be created by replaceRuntime.',
				{
					kind: 'runtime-replacement-factory',
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
				: entry.token === runtimeExecutorCapability
					? 'runtime:replace'
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
		if (isPluginOperationProtocol) {
			return throwCapabilityConflict(
				'Plugin operation protocols cannot use generic capability decoration.',
				{
					kind: 'plugin-operation-decoration-forbidden',
					plugin: formatPluginIdentity(decorator.owner),
					contributionId: decorator.declaration.contributionId,
				},
			)
		}
		if (entry.token === persistencePlanRewriterCapability) {
			return throwCapabilityConflict(
				'Persistence plan rewriters cannot be decorated through the generic capability facade.',
				{
					kind: 'persistence-rewriter-decoration-forbidden',
					plugin: formatPluginIdentity(decorator.owner),
					contributionId: decorator.declaration.contributionId,
				},
			)
		}
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
		if (isRuntimeCapability(entry.token)) {
			return throwCapabilityConflict(
				'Core Runtime capabilities cannot be decorated through the generic capability facade.',
				{
					kind: 'runtime-capability-decoration-forbidden',
					plugin: formatPluginIdentity(decorator.owner),
					capabilityId: entry.token.capabilityId,
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
