import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { adapterCapabilityPrivilege } from '../runtime/adapters/capabilities.js'
import { adapterContributionPrivileges } from '../runtime/adapters/contributions.js'
import { operationTransportBindingCapability } from '../runtime/plugin-operations/capabilities.js'
import { runtimeProviderPrivilege } from '../runtime/capabilities.js'
import { persistencePlanRewriterCapability } from '../runtime/persistence/capabilities.js'
import { pluginSchemaMutationHandlerCapability } from '../runtime/schema-mutations/capabilities.js'
import { schemaMutationTransportBindingCapability } from '../runtime/schema-mutations/transport-capabilities.js'
import {
	assertCapabilityProviderDeclaration,
	assertCapabilityRequirement,
	type CapabilityRequirement,
	type PluginCapabilityDeclaration,
} from './capabilities.js'
import type {
	PluginDeclaration,
	PluginDeclarationContext,
} from './declaration-host.js'
import type {
	PluginLifecycleContext,
	PluginLifecycleHooks,
	PluginSetup,
} from './definition.js'
import {
	pluginPrivilegeMetadata,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'
import {
	compilePluginOperationContributions,
	type PluginOperationAuthoringContribution,
} from './plugin-operation-contributions.js'
import {
	getPluginApplicationFactory,
	getPluginDeclarationContribution,
	isPluginPrivilegedContribution,
	pluginApplicationLifecyclePhases,
	runPluginDeclarationContribution,
	type PluginApplicationContribution,
	type PluginApplicationResource,
	type PluginContribution,
	type PluginDeclarationContribution,
} from './plugin-contributions.js'

/** Keeps reasons explicit while Core derives which names are required. */
export type PluginPermissionReason =
	| string
	| Readonly<{
			readonly reason: string
			readonly when?: CapabilityRequirement
	  }>

export type PluginPermissionReasons = Readonly<
	Partial<Record<PluginPrivilege, PluginPermissionReason>>
>

export interface CompiledPluginContributions {
	readonly capabilities: readonly PluginCapabilityDeclaration[]
	readonly declare: PluginDeclaration | undefined
	readonly hooks: PluginLifecycleHooks<unknown> | undefined
	readonly operations: readonly PluginOperationAuthoringContribution[]
	readonly privileges: readonly PluginPrivilegeRequest[]
	readonly setup: PluginSetup | undefined
}

const applicationResourceKeys = new Set([
	'connect',
	'dispose',
	'exports',
	'prepareSchema',
	'startRuntime',
	'startTransports',
	'stop',
])

const normalizeApplicationResource = (
	value: unknown,
): PluginApplicationResource<unknown> => {
	if (!isPlainRecord(value)) {
		throw new TypeError('plugin application resource must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !applicationResourceKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin application resource option: ${String(key)}`,
			)
		}
	}
	if (!Object.hasOwn(value, 'exports')) {
		throw new TypeError('plugin application resource must define exports')
	}
	for (const phase of pluginApplicationLifecyclePhases) {
		const callback = value[phase]
		if (callback !== undefined && typeof callback !== 'function') {
			throw new TypeError(
				`plugin application resource ${phase} must be a function`,
			)
		}
	}
	return immutableRecord({
		exports: value.exports,
		...Object.fromEntries(
			pluginApplicationLifecyclePhases.flatMap((phase) => {
				const callback = value[phase]
				return typeof callback === 'function' ? [[phase, callback]] : []
			}),
		),
	})
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
		assertCapabilityProviderDeclaration(
			declaration,
			'plugin contribution capability provider',
		)
		const token = declaration.token
		appendPrivilege(privileges, token.providerPrivilege)
		appendPrivilege(privileges, runtimeProviderPrivilege(token))
		if (token === persistencePlanRewriterCapability) {
			appendPrivilege(privileges, 'persistence:rewrite')
		}
		if (token === pluginSchemaMutationHandlerCapability) {
			appendPrivilege(privileges, 'persistence:rewrite')
		}
		if (
			token === operationTransportBindingCapability ||
			token === schemaMutationTransportBindingCapability
		) {
			appendPrivilege(privileges, 'transport:expose')
		}
		const adapterPrivileges = adapterContributionPrivileges(token)
		appendPrivilege(privileges, adapterPrivileges?.provider)
		return
	}

	assertCapabilityRequirement(
		declaration,
		'plugin contribution capability requirement',
	)
	appendPrivilege(privileges, adapterCapabilityPrivilege(declaration.token))
	appendPrivilege(
		privileges,
		adapterContributionPrivileges(declaration.token)?.consumer,
	)
}

const normalizePermissionRequests = (
	permissions: PluginPermissionReasons | undefined,
	requiredPrivileges: readonly PluginPrivilege[],
): readonly PluginPrivilegeRequest[] => {
	const untrustedPermissions: unknown = permissions ?? {}
	if (!isPlainRecord(untrustedPermissions)) {
		throw new TypeError('plugin permissions must be a plain object')
	}
	for (const key of Reflect.ownKeys(untrustedPermissions)) {
		if (
			typeof key !== 'string' ||
			!Object.hasOwn(pluginPrivilegeMetadata, key)
		) {
			throw new TypeError(`Unknown plugin permission reason: ${String(key)}`)
		}
		if (!requiredPrivileges.includes(key as PluginPrivilege)) {
			throw new TypeError(`Unused plugin permission reason: ${key}`)
		}
	}

	return immutableArray(
		requiredPrivileges.map((name) => {
			const configured = untrustedPermissions[name]
			if (configured === undefined) {
				throw new TypeError(`Missing plugin permission reason: ${name}`)
			}
			if (typeof configured === 'string') {
				assertNonEmptyString(configured, `plugin permissions.${name}`)
				return immutableRecord({ name, reason: configured })
			}
			if (!isPlainRecord(configured)) {
				throw new TypeError(
					`plugin permissions.${name} must be a reason or conditional reason`,
				)
			}
			for (const key of Reflect.ownKeys(configured)) {
				if (key !== 'reason' && key !== 'when') {
					throw new TypeError(
						`Unknown plugin permissions.${name} option: ${String(key)}`,
					)
				}
			}
			assertNonEmptyString(
				configured.reason,
				`plugin permissions.${name}.reason`,
			)
			return immutableRecord({
				name,
				reason: configured.reason,
				...(configured.when === undefined ? {} : { when: configured.when }),
			})
		}),
	)
}

const isOperationContributionKind = (kind: unknown): boolean =>
	kind === 'plugin-operation-contribution' ||
	kind === 'plugin-operation-binding-contribution' ||
	kind === 'plugin-schema-mutation-contribution' ||
	kind === 'plugin-schema-mutation-binding-contribution'

interface MutableCompilation {
	readonly application: PluginApplicationContribution[]
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
		const capability = contribution as PluginCapabilityDeclaration
		appendCapabilityPrivileges(compilation.privileges, capability)
		compilation.capabilities.push(capability)
		return
	}

	if (isOperationContributionKind(contribution.kind)) {
		const compiled = compilePluginOperationContributions([
			contribution as PluginOperationAuthoringContribution,
		])
		for (const capability of compiled.capabilities) {
			appendCapabilityPrivileges(compilation.privileges, capability)
			compilation.capabilities.push(capability)
		}
		if (compiled.operations.length > 0) {
			appendPrivilege(compilation.privileges, 'operation:declare')
		}
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
		for (const requirement of typed.requires) {
			appendCapabilityPrivileges(compilation.privileges, requirement)
			compilation.capabilities.push(requirement)
		}
		compilation.declarations.push(typed)
		return
	}

	if (getPluginApplicationFactory(contribution) !== undefined) {
		compilation.application.push(contribution as PluginApplicationContribution)
		return
	}

	throw new TypeError(
		`plugin contributions[${String(index)}] must be created by a Core contribution factory`,
	)
}

const compileApplicationContribution = (
	contribution: PluginApplicationContribution | undefined,
): Readonly<{
	readonly hooks: PluginLifecycleHooks<unknown> | undefined
	readonly setup: PluginSetup | undefined
}> => {
	if (contribution === undefined) {
		return immutableRecord({ hooks: undefined, setup: undefined })
	}
	const create = getPluginApplicationFactory(contribution)
	if (create === undefined) {
		throw new TypeError(
			'plugin application contribution must be created by contributeApplication',
		)
	}
	const resources = new WeakMap<object, PluginApplicationResource<unknown>>()
	const setup: PluginSetup = async (context) => {
		const resource = normalizeApplicationResource(await create(context))
		resources.set(context.schemas, resource)
		return resource.exports
	}
	const hooks = Object.fromEntries(
		pluginApplicationLifecyclePhases.map((phase) => [
			phase,
			async (context: PluginLifecycleContext<unknown>): Promise<void> => {
				const resource = resources.get(context.schemas)
				if (resource === undefined) {
					throw new TypeError('plugin application resource is unavailable')
				}
				try {
					await resource[phase]?.()
				} finally {
					if (phase === 'dispose') resources.delete(context.schemas)
				}
			},
		]),
	) as PluginLifecycleHooks<unknown>
	return immutableRecord({ hooks: immutableRecord(hooks), setup })
}

/** @internal Compiles one public list into Core's existing private phase inputs. */
export const compilePluginContributions = (
	contributions: readonly PluginContribution[],
	permissions: PluginPermissionReasons | undefined,
): CompiledPluginContributions => {
	const untrustedContributions: unknown = contributions
	if (!isUnknownArray(untrustedContributions)) {
		throw new TypeError('plugin contributions must be an array')
	}
	const compilation: MutableCompilation = {
		application: [],
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
	if (compilation.application.length > 1) {
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
	const application = compileApplicationContribution(compilation.application[0])
	return immutableRecord({
		capabilities: immutableArray(compilation.capabilities),
		declare,
		hooks: application.hooks,
		operations: immutableArray(compilation.operations),
		privileges: normalizePermissionRequests(
			permissions,
			compilation.privileges,
		),
		setup: application.setup,
	})
}
