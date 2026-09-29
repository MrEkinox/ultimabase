import { assertExactPlainObject } from '../exact-object-validation.js'
import {
	createPluginDefinition,
	type FrameworkPlugin,
	type FrameworkPluginContract,
} from './definition.js'
import {
	normalizeCapabilityDeclarations,
	type PluginCapabilityDeclarationOptions,
} from './capabilities.js'
import type {
	PluginDependency,
	PluginEnvironmentClaim,
	PluginPrivilege,
} from './manifest.js'
import { createPluginManifest } from './manifest.js'
import {
	compilePluginContributions,
	derivePluginCapabilityPrivileges,
} from './plugin-contribution-compiler.js'
import type {
	PluginApplicationContribution,
	PluginContribution,
	PluginDeclarationContribution,
	PluginDeclarationRequirements,
	PluginPrivilegedContribution,
} from './plugin-contributions.js'
import type { PluginOperationContribution } from './plugin-command-contribution-contracts.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { PluginSourceProjection } from './source-projections.js'
import {
	normalizePluginPermissionRequests,
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

/** Names the exact facts preserved by one configured plugin result. */
export type PluginInstanceContract = FrameworkPluginContract

/** Exact configured result returned by `plugin()`. */
export type PluginInstance<
	TContract extends PluginInstanceContract = PluginInstanceContract,
> = FrameworkPlugin<TContract>

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
	readonly privileges: PermissionRequests<TPermissions>
	readonly capabilities: ContributionCapabilityOptions<TContributions>
	readonly source: ContributionSourceProjection<TContributions>
}> => {
	assertExactPlainObject(
		options,
		pluginOptionKeys,
		'plugin options must be a plain object',
		'Unknown plugin option: ',
	)

	const compiled = compilePluginContributions(options.contributions)
	const capabilities = normalizeCapabilityDeclarations(compiled.capabilities)
	const privileges = normalizePluginPermissionRequests(
		options.permissions,
		derivePluginCapabilityPrivileges(compiled.privileges, capabilities),
		capabilities.optional,
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
		readonly privileges: PermissionRequests<TPermissions>
		readonly capabilities: ContributionCapabilityOptions<TContributions>
		readonly source: ContributionSourceProjection<TContributions>
	}>
}
