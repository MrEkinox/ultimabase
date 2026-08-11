import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { validRange } from 'semver'

import type {
	NormalizedPluginCapabilityDeclarations,
	PluginCapabilityDeclarationOptions,
} from './capabilities.js'
import type {
	PluginDeclaration,
	PluginDeclarationContext,
} from './declaration-host.js'
import type { PluginSetupContext } from './setup-registries.js'
import {
	assertPluginId,
	formatPluginIdentity,
	normalizePluginManifest,
	type PluginDependency,
	type PluginEnvironmentClaim,
	type PluginManifest,
	type PluginPrivilegeRequest,
} from './manifest.js'

export type { PluginSetupContext } from './setup-registries.js'

/** Creates the runtime exports later consumed through typed plugin lookup. */
export type PluginSetup<TExports = unknown> = (
	context: PluginSetupContext,
) => MaybePromise<TExports>

/** Resolves synchronous and asynchronous setup results without running setup. */
export type PluginSetupExports<TSetup> = TSetup extends (
	...arguments_: never[]
) => infer TResult
	? Awaited<TResult>
	: undefined

/** Supplies one lifecycle phase with setup registries and resolved exports. */
export interface PluginLifecycleContext<TExports> extends PluginSetupContext {
	readonly pluginExports: TExports
}

export type PluginLifecycleHook<TExports> = (
	context: PluginLifecycleContext<TExports>,
) => MaybePromise<void>

/** Declares lifecycle work without deciding graph or execution order. */
export interface PluginLifecycleHooks<TExports> {
	readonly connect?: PluginLifecycleHook<TExports>
	readonly prepareSchema?: PluginLifecycleHook<TExports>
	readonly startRuntime?: PluginLifecycleHook<TExports>
	readonly startTransports?: PluginLifecycleHook<TExports>
	readonly stop?: PluginLifecycleHook<TExports>
	readonly dispose?: PluginLifecycleHook<TExports>
}

/** Names every lifecycle boundary that Core may invoke for a plugin. */
export type PluginLifecyclePhase = keyof PluginLifecycleHooks<unknown>

interface PluginStaticDefinition {
	readonly declare: PluginDeclaration | undefined
}

interface PluginRuntimeDefinition {
	readonly setup: PluginSetup | undefined
	runHook(
		phase: PluginLifecyclePhase,
		context: PluginLifecycleContext<unknown>,
	): MaybePromise<void>
}

declare const pluginDefinitionBrand: unique symbol
declare const pluginSetupExportsBrand: unique symbol
const pluginRuntimeDefinition: unique symbol = Symbol(
	'ultimabase.plugin-runtime-definition',
)
const pluginStaticDefinition: unique symbol = Symbol(
	'ultimabase.plugin-static-definition',
)

/** Identifies definitions whose runtime provenance was validated by Core. */
export interface PluginDefinition {
	readonly [pluginDefinitionBrand]: true
	readonly [pluginSetupExportsBrand]: unknown
	readonly [pluginRuntimeDefinition]: PluginRuntimeDefinition
	readonly [pluginStaticDefinition]: PluginStaticDefinition
	readonly manifest: PluginManifest
	readonly dependencies?: readonly PluginDependency[] | undefined
	readonly optionalDependencies?: readonly PluginDependency[] | undefined
	readonly conflicts?: readonly string[] | undefined
	readonly plugins?: readonly PluginDefinition[] | undefined
}

/** Carries every exact declaration type into later graph and lookup stages. */
export interface FrameworkPlugin<
	TPluginId extends string = string,
	TSetupResult = unknown,
	TDependencies extends readonly PluginDependency[] | undefined =
		readonly PluginDependency[] | undefined,
	TOptionalDependencies extends readonly PluginDependency[] | undefined =
		readonly PluginDependency[] | undefined,
	TConflicts extends readonly string[] | undefined =
		readonly string[] | undefined,
	TPlugins extends readonly PluginDefinition[] | undefined =
		readonly PluginDefinition[] | undefined,
	TInstanceId extends string | undefined = string | undefined,
	TVersion extends string = string,
	TCoreRange extends string = string,
	TPrivileges extends readonly PluginPrivilegeRequest[] | undefined =
		readonly PluginPrivilegeRequest[] | undefined,
	TEnvironment extends readonly PluginEnvironmentClaim[] | undefined =
		readonly PluginEnvironmentClaim[] | undefined,
	TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
		PluginCapabilityDeclarationOptions | undefined,
> extends PluginDefinition {
	readonly [pluginSetupExportsBrand]: Awaited<TSetupResult>
	readonly manifest: PluginManifest<
		TPluginId,
		TInstanceId,
		TVersion,
		TCoreRange,
		TPrivileges extends readonly PluginPrivilegeRequest[]
			? readonly [...TPrivileges]
			: readonly [],
		TEnvironment extends readonly PluginEnvironmentClaim[]
			? readonly [...TEnvironment]
			: readonly [],
		NormalizedPluginCapabilityDeclarations<TCapabilities>
	>
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly conflicts?: TConflicts
	readonly plugins?: TPlugins
}

/** Extracts one plugin's initialized export contract without executing setup. */
export type PluginExports<TPlugin> = TPlugin extends PluginDefinition
	? TPlugin[typeof pluginSetupExportsBrand]
	: never

export interface DefinePluginOptions<
	TPluginId extends string,
	TSetupResult,
	TDependencies extends readonly PluginDependency[] | undefined,
	TOptionalDependencies extends readonly PluginDependency[] | undefined,
	TConflicts extends readonly string[] | undefined,
	TPlugins extends readonly PluginDefinition[] | undefined,
	TInstanceId extends string | undefined,
	TVersion extends string,
	TCoreRange extends string,
	TPrivileges extends readonly PluginPrivilegeRequest[] | undefined,
	TEnvironment extends readonly PluginEnvironmentClaim[] | undefined,
	TCapabilities extends PluginCapabilityDeclarationOptions | undefined,
> {
	/** Stable namespaced identity shared by every configured instance. @example "community.workflow" */
	readonly pluginId: TPluginId
	/** Distinguishes repeated configurations without deriving identity from options. @example "primary" */
	readonly instanceId?: TInstanceId
	/** Declares the plugin package's canonical semantic version. @example "1.2.0" */
	readonly version: TVersion
	/** Declares the supported `@ultimabase/core` semantic-version range. @example "^1.0.0" */
	readonly core: TCoreRange
	/** Requests only the exact Core-owned powers used by this plugin. @example `[{ name: 'runtime:observe', reason: 'Records operation timings.' }]` */
	readonly privileges?: TPrivileges
	/** Reports direct Node.js powers separately from enforceable Core facades. @example `['environment:network']` */
	readonly environment?: TEnvironment
	/** Declares inert typed providers and explicit required or optional capability uses. */
	readonly capabilities?: TCapabilities
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly conflicts?: TConflicts
	/**
	 * Declares deterministic metadata through privilege-scoped static facades.
	 * @example `declare: ({ fields }) => { fields.register(vectorMethod) }`
	 */
	readonly declare?: PluginDeclaration<TPrivileges, TCapabilities>
	readonly setup?: (context: PluginSetupContext) => TSetupResult
	readonly hooks?: PluginLifecycleHooks<Awaited<TSetupResult>>
	readonly plugins?: TPlugins
}

const lifecycleHookNames = [
	'connect',
	'prepareSchema',
	'startRuntime',
	'startTransports',
	'stop',
	'dispose',
] as const

const declaredPlugins = new WeakSet<object>()
const definePluginOptionKeys = new Set([
	'capabilities',
	'conflicts',
	'core',
	'declare',
	'dependencies',
	'environment',
	'hooks',
	'instanceId',
	'optionalDependencies',
	'pluginId',
	'plugins',
	'privileges',
	'setup',
	'version',
])

const isLifecycleHookName = (value: string): boolean =>
	lifecycleHookNames.some((hookName) => hookName === value)

const normalizePluginNames = <const TNames extends readonly string[]>(
	names: TNames,
	path: string,
): readonly [...TNames] => {
	const untrustedNames: unknown = names

	if (!isUnknownArray(untrustedNames)) {
		throw new TypeError(`${path} must be an array`)
	}

	for (const [index, name] of untrustedNames.entries()) {
		assertNonEmptyString(name, `${path}[${String(index)}]`)
	}

	return immutableArray(names)
}

const normalizePluginDependencies = <
	const TDependencies extends readonly PluginDependency[],
>(
	dependencies: TDependencies,
	path: string,
): readonly [...TDependencies] => {
	const untrustedDependencies: unknown = dependencies

	if (!isUnknownArray(untrustedDependencies)) {
		throw new TypeError(`${path} must be an array`)
	}

	return immutableArray(
		untrustedDependencies.map((dependency, index) => {
			const dependencyPath = `${path}[${String(index)}]`
			if (!isPlainRecord(dependency)) {
				throw new TypeError(`${dependencyPath} must be a plain object`)
			}

			for (const key of Object.keys(dependency)) {
				if (key !== 'pluginId' && key !== 'version' && key !== 'instanceId') {
					throw new TypeError(
						`${dependencyPath} contains unknown option: ${key}`,
					)
				}
			}

			assertPluginId(dependency.pluginId, `${dependencyPath}.pluginId`)
			assertNonEmptyString(dependency.version, `${dependencyPath}.version`)
			if (validRange(dependency.version) === null) {
				throw new TypeError(
					`${dependencyPath}.version must be a valid semantic version range`,
				)
			}

			if (dependency.instanceId !== undefined) {
				assertNonEmptyString(
					dependency.instanceId,
					`${dependencyPath}.instanceId`,
				)
			}

			return immutableRecord({
				pluginId: dependency.pluginId,
				version: dependency.version,
				...(dependency.instanceId === undefined
					? {}
					: { instanceId: dependency.instanceId }),
			})
		}),
	) as readonly [...TDependencies]
}

export const assertPluginDefinition: (
	value: unknown,
	path: string,
) => asserts value is PluginDefinition = (value, path) => {
	if (!isPlainRecord(value) || !declaredPlugins.has(value)) {
		throw new TypeError(`${path} must be created by definePlugin`)
	}
}

const getPluginRuntimeDefinition = (
	plugin: PluginDefinition,
): PluginRuntimeDefinition => plugin[pluginRuntimeDefinition]

const getPluginStaticDefinition = (
	plugin: PluginDefinition,
): PluginStaticDefinition => plugin[pluginStaticDefinition]

/** Runs one setup callback while keeping its exact export type private to the definition. */
export const runPluginSetup = (
	plugin: PluginDefinition,
	context: PluginSetupContext,
): MaybePromise<unknown> => getPluginRuntimeDefinition(plugin).setup?.(context)

/** Runs one pure synchronous static declaration before schema compilation. */
export const runPluginDeclaration = (
	plugin: PluginDefinition,
	context: PluginDeclarationContext,
): void => {
	const declaration = getPluginStaticDefinition(plugin).declare

	if (declaration === undefined) {
		return
	}

	// Keep the runtime boundary defensive for declarations loaded from JavaScript.
	const invokeDeclaration = declaration as (
		context: PluginDeclarationContext,
	) => unknown
	const returned = invokeDeclaration(context)

	if (returned !== undefined) {
		throw new TypeError(
			`Plugin "${formatPluginIdentity(plugin.manifest.identity)}" declare must be synchronous and return nothing`,
		)
	}
}

/** Invokes one lifecycle hook paired with the exports created by the same definition. */
export const runPluginLifecycleHook = (
	plugin: PluginDefinition,
	phase: PluginLifecyclePhase,
	context: PluginLifecycleContext<unknown>,
): MaybePromise<void> =>
	getPluginRuntimeDefinition(plugin).runHook(phase, context)

const normalizeNestedPlugins = <
	const TPlugins extends readonly PluginDefinition[],
>(
	plugins: TPlugins,
): readonly [...TPlugins] => {
	const untrustedPlugins: unknown = plugins

	if (!isUnknownArray(untrustedPlugins)) {
		throw new TypeError('plugins must be an array')
	}

	for (const [index, plugin] of untrustedPlugins.entries()) {
		assertPluginDefinition(plugin, `plugins[${String(index)}]`)
	}

	return immutableArray(plugins)
}

const normalizeLifecycleHooks = <const THooks extends object>(
	hooks: THooks,
): Readonly<THooks> => {
	const untrustedHooks: unknown = hooks

	if (!isPlainRecord(untrustedHooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	for (const [name, hook] of Object.entries(untrustedHooks)) {
		if (!isLifecycleHookName(name)) {
			throw new TypeError(`Unknown plugin lifecycle hook: ${name}`)
		}

		if (typeof hook !== 'function') {
			throw new TypeError(`hooks.${name} must be a function`)
		}
	}

	return immutableRecord(hooks)
}

/** Creates immutable plugin metadata without initializing its runtime work. */
export const definePlugin = <
	const TPluginId extends string,
	const TSetupResult = undefined,
	const TDependencies extends readonly PluginDependency[] | undefined =
		undefined,
	const TOptionalDependencies extends readonly PluginDependency[] | undefined =
		undefined,
	const TConflicts extends readonly string[] | undefined = undefined,
	const TPlugins extends readonly PluginDefinition[] | undefined = undefined,
	const TInstanceId extends string | undefined = undefined,
	const TVersion extends string = string,
	const TCoreRange extends string = string,
	const TPrivileges extends readonly PluginPrivilegeRequest[] | undefined =
		undefined,
	const TEnvironment extends readonly PluginEnvironmentClaim[] | undefined =
		undefined,
	const TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
		undefined,
>(
	options: DefinePluginOptions<
		TPluginId,
		TSetupResult,
		TDependencies,
		TOptionalDependencies,
		TConflicts,
		TPlugins,
		TInstanceId,
		TVersion,
		TCoreRange,
		TPrivileges,
		TEnvironment,
		TCapabilities
	>,
): FrameworkPlugin<
	TPluginId,
	TSetupResult,
	TDependencies,
	TOptionalDependencies,
	TConflicts,
	TPlugins,
	TInstanceId,
	TVersion,
	TCoreRange,
	TPrivileges,
	TEnvironment,
	TCapabilities
> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('plugin options must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (!definePluginOptionKeys.has(key)) {
			throw new TypeError(`plugin options contain unknown option: ${key}`)
		}
	}

	const manifest = normalizePluginManifest({
		pluginId: options.pluginId,
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		version: options.version,
		core: options.core,
		...(options.privileges === undefined
			? {}
			: { privileges: options.privileges }),
		...(options.environment === undefined
			? {}
			: { environment: options.environment }),
		...(options.capabilities === undefined
			? {}
			: { capabilities: options.capabilities }),
	})

	if (options.setup !== undefined && typeof options.setup !== 'function') {
		throw new TypeError('setup must be a function')
	}

	if (options.declare !== undefined && typeof options.declare !== 'function') {
		throw new TypeError('declare must be a function')
	}

	const lifecycleHooks =
		options.hooks === undefined
			? undefined
			: normalizeLifecycleHooks(options.hooks)

	const staticDefinition = immutableRecord({
		declare: options.declare,
	})
	const runtimeDefinition = immutableRecord({
		setup: options.setup,
		runHook: (
			phase: PluginLifecyclePhase,
			context: PluginLifecycleContext<unknown>,
		): MaybePromise<void> => {
			const hook = lifecycleHooks?.[phase]

			if (hook === undefined) {
				return undefined
			}

			// The manager supplies the export produced by this exact setup callback.
			return hook(context as PluginLifecycleContext<Awaited<TSetupResult>>)
		},
	})
	const plugin = immutableRecord({
		[pluginRuntimeDefinition]: runtimeDefinition,
		[pluginStaticDefinition]: staticDefinition,
		manifest,
		...(options.dependencies === undefined
			? {}
			: {
					dependencies: normalizePluginDependencies(
						options.dependencies,
						'dependencies',
					),
				}),
		...(options.optionalDependencies === undefined
			? {}
			: {
					optionalDependencies: normalizePluginDependencies(
						options.optionalDependencies,
						'optionalDependencies',
					),
				}),
		...(options.conflicts === undefined
			? {}
			: {
					conflicts: normalizePluginNames(options.conflicts, 'conflicts'),
				}),
		...(options.plugins === undefined
			? {}
			: { plugins: normalizeNestedPlugins(options.plugins) }),
	})

	declaredPlugins.add(plugin)

	// Each optional container was copied through the generic-preserving normalizer above.
	return plugin as FrameworkPlugin<
		TPluginId,
		TSetupResult,
		TDependencies,
		TOptionalDependencies,
		TConflicts,
		TPlugins,
		TInstanceId,
		TVersion,
		TCoreRange,
		TPrivileges,
		TEnvironment,
		TCapabilities
	>
}
