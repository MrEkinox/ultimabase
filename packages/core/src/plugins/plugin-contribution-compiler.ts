import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { adapterCapabilityPrivilege } from '../runtime/adapters/capabilities.js'
import { adapterContributionPrivileges } from '../runtime/adapters/contributions.js'
import { runtimeProviderPrivilege } from '../runtime/capabilities.js'
import { persistencePlanRewriterCapability } from '../runtime/persistence/capabilities.js'
import type {
	PluginCapabilityDeclaration,
	PluginCapabilityDeclarations,
} from './capabilities.js'
import type {
	PluginDeclaration,
	PluginDeclarationContext,
} from './declaration-host.js'
import type { PluginPrivilege } from './manifest.js'
import {
	compilePluginOperationContributions,
	type PluginOperationAuthoringContribution,
} from './plugin-operation-contributions.js'
import {
	getPluginApplicationFactory,
	getPluginDeclarationContribution,
	isPluginPrivilegedContribution,
	runPluginDeclarationContribution,
	type PluginApplicationResourceFactory,
	type PluginContribution,
	type PluginDeclarationContribution,
} from './plugin-contributions.js'
import type { PluginCommandPlan } from './plugin-command-plan.js'

export interface CompiledPluginContributions {
	readonly applicationFactory: PluginApplicationResourceFactory | undefined
	readonly capabilities: readonly PluginCapabilityDeclaration[]
	readonly commands: PluginCommandPlan
	readonly declare: PluginDeclaration | undefined
	readonly privileges: readonly PluginPrivilege[]
}

const appendPrivilege = (
	privileges: PluginPrivilege[],
	privilege: PluginPrivilege | undefined,
): void => {
	if (privilege !== undefined && !privileges.includes(privilege)) {
		privileges.push(privilege)
	}
}

const appendCapabilityPrivileges = (
	privileges: PluginPrivilege[],
	declaration: PluginCapabilityDeclaration,
): void => {
	if (declaration.kind === 'capability-provider') {
		const token = declaration.token
		appendPrivilege(privileges, token.providerPrivilege)
		appendPrivilege(privileges, runtimeProviderPrivilege(token))
		if (token === persistencePlanRewriterCapability) {
			appendPrivilege(privileges, 'persistence:rewrite')
		}
		appendPrivilege(privileges, adapterContributionPrivileges(token)?.provider)
		return
	}

	appendPrivilege(privileges, adapterCapabilityPrivilege(declaration.token))
	appendPrivilege(
		privileges,
		adapterContributionPrivileges(declaration.token)?.consumer,
	)
}

/** @internal Adds privileges implied by one already normalized capability plan. */
export const derivePluginCapabilityPrivileges = (
	initial: readonly PluginPrivilege[],
	capabilities: PluginCapabilityDeclarations,
): readonly PluginPrivilege[] => {
	const privileges = [...initial]
	for (const capability of capabilities.provides) {
		appendCapabilityPrivileges(privileges, capability)
	}
	for (const capability of capabilities.requires) {
		appendCapabilityPrivileges(privileges, capability)
	}
	for (const capability of capabilities.optional) {
		appendCapabilityPrivileges(privileges, capability)
	}
	return immutableArray(privileges)
}

const isOperationContributionKind = (kind: unknown): boolean =>
	kind === 'plugin-operation-contribution' ||
	kind === 'plugin-operation-binding-contribution' ||
	kind === 'plugin-schema-mutation-contribution' ||
	kind === 'plugin-schema-mutation-binding-contribution'

interface MutableCompilation {
	readonly applicationFactories: PluginApplicationResourceFactory[]
	readonly capabilities: PluginCapabilityDeclaration[]
	readonly declarations: PluginDeclarationContribution[]
	readonly operations: PluginOperationAuthoringContribution[]
	readonly privileges: PluginPrivilege[]
}

const compileOneContribution = (
	value: PluginContribution,
	index: number,
	compilation: MutableCompilation,
): void => {
	let contribution: PluginContribution = value
	if (isPluginPrivilegedContribution(contribution)) {
		for (const privilege of contribution.privileges) {
			appendPrivilege(compilation.privileges, privilege)
		}
		contribution = contribution.contribution
	}
	if (!isPlainRecord(contribution)) {
		throw new TypeError(
			`plugin contributions[${String(index)}] must be created by a Core contribution factory`,
		)
	}

	if (
		contribution.kind === 'capability-provider' ||
		contribution.kind === 'capability-requirement'
	) {
		compilation.capabilities.push(contribution)
		return
	}

	if (isOperationContributionKind(contribution.kind)) {
		compilation.operations.push(
			contribution as PluginOperationAuthoringContribution,
		)
		return
	}

	const declaration = getPluginDeclarationContribution(contribution)
	if (declaration !== undefined) {
		const typed = contribution as PluginDeclarationContribution
		for (const privilege of declaration.privileges) {
			appendPrivilege(compilation.privileges, privilege)
		}
		compilation.capabilities.push(...typed.requires)
		compilation.declarations.push(typed)
		return
	}

	const applicationFactory = getPluginApplicationFactory(contribution)
	if (applicationFactory !== undefined) {
		compilation.applicationFactories.push(applicationFactory)
		return
	}

	throw new TypeError(
		`plugin contributions[${String(index)}] must be created by a Core contribution factory`,
	)
}

/** @internal Compiles one public list directly into Core's native plugin plan. */
export const compilePluginContributions = (
	contributions: readonly PluginContribution[],
): CompiledPluginContributions => {
	const untrustedContributions: unknown = contributions
	if (!isUnknownArray(untrustedContributions)) {
		throw new TypeError('plugin contributions must be an array')
	}
	const compilation: MutableCompilation = {
		applicationFactories: [],
		capabilities: [],
		declarations: [],
		operations: [],
		privileges: [],
	}
	for (const [index, contribution] of untrustedContributions.entries()) {
		compileOneContribution(
			contribution as PluginContribution,
			index,
			compilation,
		)
	}
	if (compilation.applicationFactories.length > 1) {
		throw new TypeError(
			'plugin contributions may contain at most one application resource',
		)
	}

	const declare: PluginDeclaration | undefined =
		compilation.declarations.length === 0
			? undefined
			: (context: PluginDeclarationContext): undefined => {
					for (const contribution of compilation.declarations) {
						runPluginDeclarationContribution(contribution, context)
					}
					return undefined
				}
	const compiledOperations = compilePluginOperationContributions(
		compilation.operations,
	)
	if (compiledOperations.operations.length > 0) {
		appendPrivilege(compilation.privileges, 'operation:declare')
		if (
			compiledOperations.operations.some((operation) =>
				operation.kind === 'plugin-operation'
					? operation.input.typegen !== undefined ||
						operation.result.typegen !== undefined
					: operation.input.typegen !== undefined,
			)
		) {
			appendPrivilege(compilation.privileges, 'typegen:reference')
		}
	}
	if (
		compiledOperations.handlers.some(
			({ source }) => source.kind === 'plugin-schema-mutation',
		)
	) {
		appendPrivilege(compilation.privileges, 'persistence:rewrite')
	}
	if (compiledOperations.transports.length > 0) {
		appendPrivilege(compilation.privileges, 'transport:expose')
	}

	return immutableRecord({
		applicationFactory: compilation.applicationFactories[0],
		capabilities: immutableArray(compilation.capabilities),
		commands: immutableRecord({
			declarations: compiledOperations.operations,
			handlers: compiledOperations.handlers,
			transports: compiledOperations.transports,
		}),
		declare,
		privileges: immutableArray(compilation.privileges),
	})
}
