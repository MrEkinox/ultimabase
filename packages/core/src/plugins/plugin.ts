import { isPlainRecord } from '@ultimabase/shared'

import { definePlugin, type FrameworkPlugin } from './definition.js'
import type { PluginCapabilityDeclarationOptions } from './capabilities.js'
import type {
	PluginDependency,
	PluginEnvironmentClaim,
	PluginPrivilege,
	PluginPrivilegeRequest,
} from './manifest.js'
import {
	compilePluginContributions,
	type PluginPermissionReasons,
} from './plugin-contribution-compiler.js'
import type {
	PluginApplicationContribution,
	PluginContribution,
	PluginDeclarationContribution,
	PluginPrivilegedContribution,
} from './plugin-contributions.js'
import type {
	PluginOperationAuthoringContribution,
	PluginOperationContributionCapabilities,
} from './plugin-operation-contributions.js'

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

type ContributionOperations<TContribution> =
	UnwrapContribution<TContribution> extends infer TUnwrapped
		? TUnwrapped extends PluginOperationAuthoringContribution
			? readonly [TUnwrapped]
			: readonly []
		: readonly []

type CollectContributionOperations<
	TContributions extends readonly PluginContribution[],
> = TContributions extends readonly [
	infer THead extends PluginContribution,
	...infer TTail extends readonly PluginContribution[],
]
	? readonly [
			...ContributionOperations<THead>,
			...CollectContributionOperations<TTail>,
		]
	: readonly []

type ContributionCapabilityOptions<
	TContributions extends readonly PluginContribution[],
> = PluginOperationContributionCapabilities<
	CollectContributionCapabilities<TContributions>,
	CollectContributionOperations<TContributions>
>

type PermissionRequest<TPermissions, TName extends PluginPrivilege> = Readonly<{
	readonly name: TName
	readonly reason: string
	readonly when?: TPermissions extends Readonly<
		Record<TName, infer TConfigured>
	>
		? TConfigured extends Readonly<{ readonly when?: infer TWhen }>
			? TWhen
			: never
		: never
}>

type PermissionRequests<TPermissions> = readonly PermissionRequest<
	TPermissions,
	Extract<keyof TPermissions, PluginPrivilege>
>[]

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
	TPermissions extends PluginPermissionReasons | undefined,
> {
	/** Stable namespaced package identity. @example "community.workflow" */
	readonly id: TPluginId
	/** Exact package version recorded in plugin provenance. @example "1.2.0" */
	readonly version: TVersion
	/** Supported Core semantic-version range. @example "^1.0.0" */
	readonly core: TCoreRange
	/** Explicit identity when this plugin is configured more than once. */
	readonly instanceId?: TInstanceId
	/** One ordered list of every capability, declaration, operation, and resource. */
	readonly contributions: TContributions
	/** Human-readable reasons for exactly the privileges derived from contributions. */
	readonly permissions?: TPermissions
	readonly environment?: TEnvironment
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly peers?: TPeers
	readonly conflicts?: TConflicts
}

/** Exact configured result returned by `plugin()`. */
export type PluginInstance<
	TPluginId extends string = string,
	TExports = unknown,
	TInstanceId extends string | undefined = string | undefined,
	TVersion extends string = string,
	TCoreRange extends string = string,
	TDependencies extends readonly PluginDependency[] | undefined =
		readonly PluginDependency[] | undefined,
	TOptionalDependencies extends readonly PluginDependency[] | undefined =
		readonly PluginDependency[] | undefined,
	TPeers extends readonly PluginDependency[] | undefined =
		readonly PluginDependency[] | undefined,
	TConflicts extends readonly string[] | undefined =
		readonly string[] | undefined,
	TEnvironment extends readonly PluginEnvironmentClaim[] | undefined =
		readonly PluginEnvironmentClaim[] | undefined,
	TPrivileges extends readonly PluginPrivilegeRequest[] =
		readonly PluginPrivilegeRequest[],
	TCapabilities extends PluginCapabilityDeclarationOptions =
		PluginCapabilityDeclarationOptions,
> = FrameworkPlugin<
	TPluginId,
	TExports,
	TDependencies,
	TOptionalDependencies,
	TConflicts,
	TInstanceId,
	TVersion,
	TCoreRange,
	TPrivileges,
	TEnvironment,
	TCapabilities,
	TPeers
>

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
	const TPermissions extends PluginPermissionReasons | undefined = undefined,
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
		TPermissions
	>,
): PluginInstance<
	TPluginId,
	ContributionExports<TContributions>,
	TInstanceId,
	TVersion,
	TCoreRange,
	TDependencies,
	TOptionalDependencies,
	TPeers,
	TConflicts,
	TEnvironment,
	PermissionRequests<TPermissions>,
	ContributionCapabilityOptions<TContributions>
> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('plugin options must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !pluginOptionKeys.has(key)) {
			throw new TypeError(`Unknown plugin option: ${String(key)}`)
		}
	}

	const compiled = compilePluginContributions(
		options.contributions,
		options.permissions,
	)
	return definePlugin({
		pluginId: options.id,
		version: options.version,
		core: options.core,
		capabilities: compiled.capabilities,
		operations: compiled.operations,
		privileges: compiled.privileges,
		...(compiled.declare === undefined ? {} : { declare: compiled.declare }),
		...(compiled.setup === undefined ? {} : { setup: compiled.setup }),
		...(compiled.hooks === undefined ? {} : { hooks: compiled.hooks }),
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		...(options.environment === undefined
			? {}
			: { environment: options.environment }),
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
	}) as PluginInstance<
		TPluginId,
		ContributionExports<TContributions>,
		TInstanceId,
		TVersion,
		TCoreRange,
		TDependencies,
		TOptionalDependencies,
		TPeers,
		TConflicts,
		TEnvironment,
		PermissionRequests<TPermissions>,
		ContributionCapabilityOptions<TContributions>
	>
}
