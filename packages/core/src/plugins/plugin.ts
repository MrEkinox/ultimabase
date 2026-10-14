import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertExactPlainObject } from '../exact-object-validation.js'
import {
	createPluginDefinition,
	type FrameworkPlugin,
	type FrameworkPluginContract,
} from './definition.js'
import {
	normalizeCapabilityDeclarations,
	type PluginCapabilityDeclaration,
	type PluginCapabilityDeclarationOptions,
} from './capabilities.js'
import { capabilityDeclarationPrivileges } from './capability-rules.js'
import type {
	PluginDependency,
	PluginEnvironmentClaim,
	PluginPrivilege,
} from './manifest.js'
import { createPluginManifest, pluginPrivilegeMetadata } from './manifest.js'
import {
	readPluginCommandContribution,
	type PluginCommandContributionPlan,
} from './plugin-command-contributions.js'
import {
	getPluginApplicationFactory,
	getPluginDeclarationContribution,
	isPluginPrivilegedContribution,
	runPluginDeclarationContribution,
	type PluginApplicationContribution,
	type PluginApplicationResourceFactory,
	type PluginContribution,
	type PluginDeclarationContribution,
	type PluginDeclarationRequirements,
	type PluginPrivilegedContribution,
} from './plugin-contributions.js'
import type { PluginCommandPlan } from './plugin-command-plan.js'
import type { PluginDeclaration } from './declaration-host.js'
import type { PluginOperationContribution } from './plugin-command-contribution-contracts.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { PluginSourceProjection } from './source-projections.js'
import {
	normalizePluginPermissionRequests,
	type DerivedPluginPrivilege,
	type PluginPermissionReasons,
} from './plugin-permissions.js'

type UnwrapContribution<TContribution> =
	TContribution extends PluginPrivilegedContribution<infer TWrapped>
		? TWrapped
		: TContribution

type ApplicationContribution<TContribution> =
	TContribution extends PluginContribution
		? UnwrapContribution<TContribution> extends PluginApplicationContribution
			? UnwrapContribution<TContribution>
			: never
		: never

type ContributionExports<TContributions> =
	TContributions extends readonly PluginContribution[]
		? [ApplicationContribution<TContributions[number]>] extends [never]
			? undefined
			: ApplicationContribution<
						TContributions[number]
				  > extends PluginApplicationContribution<infer TExports>
				? TExports
				: undefined
		: undefined

type ContributionCapabilities<TContribution> =
	UnwrapContribution<TContribution> extends infer TUnwrapped
		? TUnwrapped extends PluginCapabilityDeclarationOptions[number]
			? readonly [TUnwrapped]
			: TUnwrapped extends PluginDeclarationContribution<infer TRequirements>
				? TRequirements
				: readonly []
		: readonly []

type ContributionSource<TContribution> =
	UnwrapContribution<TContribution> extends infer TUnwrapped
		? TUnwrapped extends PluginDeclarationContribution<
				PluginDeclarationRequirements,
				infer TProjection
			>
			? TProjection
			: TUnwrapped extends PluginOperationContribution<
						infer TOperation extends PluginOperationDefinition
				  >
				? Readonly<{
						operations: Readonly<Record<TOperation['name'], TOperation>>
					}>
				: never
		: never

type ContributionSourceProjection<
	TContributions extends readonly PluginContribution[],
> = Extract<ContributionSource<TContributions[number]>, PluginSourceProjection>

type CollectContributionCapabilities<
	TContributions extends readonly PluginContribution[],
> = TContributions extends readonly [
	infer THead extends PluginContribution,
	...infer TTail extends readonly PluginContribution[],
]
	? readonly [
			...ContributionCapabilities<THead>,
			...CollectContributionCapabilities<TTail>,
		]
	: readonly []

type ContributionCapabilityOptions<
	TContributions extends readonly PluginContribution[],
> = CollectContributionCapabilities<TContributions>

declare const pluginStaticSourceType: unique symbol

/** Defines one plugin directly from public facts and one contribution list. */
export interface PluginOptions<
	TPluginId extends string,
	TInstanceId extends string | undefined,
	TVersion extends string,
	TCoreRange extends string,
	TDependencies extends readonly PluginDependency[] | undefined,
	TOptionalDependencies extends readonly PluginDependency[] | undefined,
	TPeers extends readonly PluginDependency[] | undefined,
	TConflicts extends readonly string[] | undefined,
	TEnvironment extends readonly PluginEnvironmentClaim[] | undefined,
	TContributions extends readonly PluginContribution[],
	TSource extends PluginSourceProjection = PluginSourceProjection,
> {
	/**
	 * Type-only: carries the static source passed as `plugin()`'s last type
	 * argument (ADR-0316). It is never set at Runtime.
	 */
	readonly [pluginStaticSourceType]?: TSource
	/** Stable namespaced package identity. @example "community.workflow" */
	readonly id: TPluginId
	/** Exact package version recorded in plugin provenance. @example "1.2.0" */
	readonly version: TVersion
	/** Supported Core semantic-version range, checked against the installed Core like a peer range. @example "^0.0.0" */
	readonly core: TCoreRange
	/** Explicit identity when this plugin is configured more than once. */
	readonly instanceId?: TInstanceId
	/** One ordered list of every capability, declaration, operation, and resource. */
	readonly contributions: TContributions
	/**
	 * Optional reasons for privileges Core derives from `contributions`.
	 * Required only for derived `authority:elevate` and `storage:private`.
	 */
	readonly permissions?: PluginPermissionReasons | undefined
	readonly environment?: TEnvironment
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly peers?: TPeers
	readonly conflicts?: TConflicts
}

/** Names the exact facts preserved by one configured plugin result. */
export type PluginInstanceContract = FrameworkPluginContract

/** Exact configured result returned by `plugin()`. */
export type PluginInstance<
	TContract extends PluginInstanceContract = PluginInstanceContract,
> = FrameworkPlugin<TContract>

const commandContributionKinds: ReadonlySet<unknown> = new Set([
	'plugin-operation-contribution',
	'plugin-operation-binding-contribution',
	'plugin-schema-mutation-contribution',
])

interface CompiledPluginContributions {
	readonly applicationFactory: PluginApplicationResourceFactory | undefined
	readonly capabilities: readonly PluginCapabilityDeclaration[]
	readonly commands: PluginCommandPlan
	readonly declare: PluginDeclaration | undefined
	readonly privileges: DerivedPluginPrivilege[]
}

/** Compiles one public contribution list directly into Core's native plugin plan. */
const compilePluginContributions = (
	contributions: readonly PluginContribution[],
): CompiledPluginContributions => {
	const untrustedContributions: unknown = contributions
	if (!isUnknownArray(untrustedContributions)) {
		throw new TypeError('plugin contributions must be an array')
	}
	const privileges: DerivedPluginPrivilege[] = []
	const derive = (privilege: PluginPrivilege, description: string): void => {
		privileges.push({ privilege, description })
	}
	const capabilities: PluginCapabilityDeclaration[] = []
	const declarations: Parameters<typeof runPluginDeclarationContribution>[0][] =
		[]
	const applicationFactories: PluginApplicationResourceFactory[] = []
	const commandContributions: object[] = []
	for (const [index, value] of untrustedContributions.entries()) {
		let contribution = value as PluginContribution
		if (isPluginPrivilegedContribution(contribution)) {
			for (const privilege of contribution.privileges) {
				derive(
					privilege,
					`Uses the Core ${pluginPrivilegeMetadata[privilege].facade} facade from a contribution callback.`,
				)
			}
			contribution = contribution.contribution
		}
		const forged = (): TypeError =>
			new TypeError(
				`plugin contributions[${String(index)}] must be created by a Core contribution factory`,
			)
		if (!isPlainRecord(contribution)) throw forged()
		if (
			contribution.kind === 'capability-provider' ||
			contribution.kind === 'capability-requirement'
		) {
			capabilities.push(contribution)
			continue
		}
		// Command factories are verified after every other contribution is classified.
		if (commandContributionKinds.has(contribution.kind)) {
			commandContributions.push(contribution)
			continue
		}
		const declaration = getPluginDeclarationContribution(contribution)
		if (declaration !== undefined) {
			privileges.push(...declaration.privileges)
			capabilities.push(...declaration.requires)
			declarations.push(declaration)
			continue
		}
		const applicationFactory = getPluginApplicationFactory(contribution)
		if (applicationFactory === undefined) throw forged()
		applicationFactories.push(applicationFactory)
	}
	if (applicationFactories.length > 1) {
		throw new TypeError(
			'plugin contributions may contain at most one application resource',
		)
	}

	const commands = commandContributions.map(
		(contribution, index): PluginCommandContributionPlan => {
			const command = readPluginCommandContribution(contribution)
			if (command === undefined) {
				throw new TypeError(
					`plugin operation contributions[${String(index)}] must be created by a Core contribution factory`,
				)
			}
			return command
		},
	)
	const handlers = commands.flatMap(({ handler }) =>
		handler === undefined ? [] : [handler],
	)
	const commandSources = handlers.map(({ source }) => source)
	const transports = commands.flatMap(({ transports }) => transports)
	if (commandSources.length > 0) {
		derive('operation:declare', 'Declares plugin operations.')
	}
	if (handlers.some(({ source }) => source.kind === 'plugin-schema-mutation')) {
		derive(
			'persistence:rewrite',
			'Declares schema mutations that rewrite persistence.',
		)
	}
	if (
		transports.length > 0 ||
		handlers.some((handler) => handler.public !== undefined)
	) {
		derive('transport:expose', 'Binds operations to transports.')
	}

	return {
		applicationFactory: applicationFactories[0],
		capabilities,
		commands: immutableRecord({
			declarations: immutableArray(commandSources),
			handlers: immutableArray(handlers),
			transports: immutableArray(transports),
		}),
		declare:
			declarations.length === 0
				? undefined
				: (context): undefined => {
						for (const declaration of declarations) {
							runPluginDeclarationContribution(declaration, context)
						}
						return undefined
					},
		privileges,
	}
}

const pluginOptionKeys = new Set([
	'conflicts',
	'contributions',
	'core',
	'dependencies',
	'environment',
	'id',
	'instanceId',
	'optionalDependencies',
	'peers',
	'permissions',
	'version',
])

/** Compiles one contribution-first definition into Core's private plugin graph. */
export const plugin = <
	const TPluginId extends string,
	const TInstanceId extends string | undefined = undefined,
	const TVersion extends string = string,
	const TCoreRange extends string = string,
	const TDependencies extends readonly PluginDependency[] | undefined =
		undefined,
	const TOptionalDependencies extends readonly PluginDependency[] | undefined =
		undefined,
	const TPeers extends readonly PluginDependency[] | undefined = undefined,
	const TConflicts extends readonly string[] | undefined = undefined,
	const TEnvironment extends readonly PluginEnvironmentClaim[] | undefined =
		undefined,
	const TContributions extends readonly PluginContribution[] = readonly [],
	/**
	 * Static source projection of the plugin. Inferred from `contributions` by
	 * default; a facade that knows the projection better, such as
	 * `definePlugin`, passes it explicitly instead of re-typing the result
	 * (ADR-0316).
	 */
	TSource extends PluginSourceProjection =
		ContributionSourceProjection<TContributions>,
>(
	options: PluginOptions<
		TPluginId,
		TInstanceId,
		TVersion,
		TCoreRange,
		TDependencies,
		TOptionalDependencies,
		TPeers,
		TConflicts,
		TEnvironment,
		TContributions,
		TSource
	>,
): PluginInstance<{
	readonly id: TPluginId
	readonly exports: ContributionExports<TContributions>
	readonly instanceId: TInstanceId
	readonly version: TVersion
	readonly core: TCoreRange
	readonly dependencies: TDependencies
	readonly optionalDependencies: TOptionalDependencies
	readonly peers: TPeers
	readonly conflicts: TConflicts
	readonly environment: TEnvironment
	readonly capabilities: ContributionCapabilityOptions<TContributions>
	readonly source: TSource
}> => {
	assertExactPlainObject(
		options,
		pluginOptionKeys,
		'plugin options must be a plain object',
		'Unknown plugin option: ',
	)

	const compiled = compilePluginContributions(options.contributions)
	const capabilities = normalizeCapabilityDeclarations(compiled.capabilities)
	for (const declaration of [
		...capabilities.provides,
		...capabilities.requires,
		...capabilities.optional,
	]) {
		compiled.privileges.push(...capabilityDeclarationPrivileges(declaration))
	}
	const privileges = normalizePluginPermissionRequests(
		options.permissions,
		compiled.privileges,
	)
	const manifest = createPluginManifest({
		pluginId: options.id,
		version: options.version,
		core: options.core,
		capabilities,
		privileges,
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		...(options.environment === undefined
			? {}
			: { environment: options.environment }),
	})
	return createPluginDefinition({
		manifest,
		plan: {
			applicationFactory: compiled.applicationFactory,
			commands: compiled.commands,
			declare: compiled.declare,
		},
		...(options.dependencies === undefined
			? {}
			: { dependencies: options.dependencies }),
		...(options.optionalDependencies === undefined
			? {}
			: { optionalDependencies: options.optionalDependencies }),
		...(options.peers === undefined ? {} : { peers: options.peers }),
		...(options.conflicts === undefined
			? {}
			: { conflicts: options.conflicts }),
	}) as PluginInstance<{
		readonly id: TPluginId
		readonly exports: ContributionExports<TContributions>
		readonly instanceId: TInstanceId
		readonly version: TVersion
		readonly core: TCoreRange
		readonly dependencies: TDependencies
		readonly optionalDependencies: TOptionalDependencies
		readonly peers: TPeers
		readonly conflicts: TConflicts
		readonly environment: TEnvironment
		readonly capabilities: ContributionCapabilityOptions<TContributions>
		readonly source: TSource
	}>
}
