import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { PluginSetupContext } from './setup-registries.js'

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

interface PluginRuntimeDefinition {
	readonly setup: PluginSetup | undefined
	runHook(
		phase: PluginLifecyclePhase,
		context: PluginLifecycleContext<unknown>,
	): MaybePromise<void>
}

declare const pluginDefinitionBrand: unique symbol
const pluginRuntimeDefinition: unique symbol = Symbol(
	'ultimabase.plugin-runtime-definition',
)

/** Identifies definitions whose runtime provenance was validated by Core. */
export interface PluginDefinition {
	readonly [pluginDefinitionBrand]: true
	readonly [pluginRuntimeDefinition]: PluginRuntimeDefinition
	readonly name: string
	readonly slot?: string
	readonly dependencies?: readonly string[] | undefined
	readonly optionalDependencies?: readonly string[] | undefined
	readonly conflicts?: readonly string[] | undefined
	readonly plugins?: readonly PluginDefinition[] | undefined
}

/** Carries every exact declaration type into later graph and lookup stages. */
export interface FrameworkPlugin<
	TName extends string = string,
	TSetupResult = unknown,
	TDependencies extends readonly string[] | undefined =
		readonly string[] | undefined,
	TOptionalDependencies extends readonly string[] | undefined =
		readonly string[] | undefined,
	TConflicts extends readonly string[] | undefined =
		readonly string[] | undefined,
	TPlugins extends readonly PluginDefinition[] | undefined =
		readonly PluginDefinition[] | undefined,
	TSlot extends string = string,
> extends PluginDefinition {
	readonly name: TName
	readonly slot?: TSlot
	readonly version?: string
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly conflicts?: TConflicts
	readonly setup?: (context: PluginSetupContext) => TSetupResult
	readonly hooks?: PluginLifecycleHooks<Awaited<TSetupResult>>
	readonly plugins?: TPlugins
}

/** Extracts one plugin's initialized export contract without executing setup. */
export type PluginExports<TPlugin> =
	TPlugin extends FrameworkPlugin<string, infer TSetupResult>
		? Awaited<TSetupResult>
		: never

export interface DefinePluginOptions<
	TName extends string,
	TSetupResult,
	TDependencies extends readonly string[] | undefined,
	TOptionalDependencies extends readonly string[] | undefined,
	TConflicts extends readonly string[] | undefined,
	TPlugins extends readonly PluginDefinition[] | undefined,
	TSlot extends string,
> {
	readonly name: TName
	readonly slot?: TSlot
	readonly version?: string
	readonly dependencies?: TDependencies
	readonly optionalDependencies?: TOptionalDependencies
	readonly conflicts?: TConflicts
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

/** Runs one setup callback while keeping its exact export type private to the definition. */
export const runPluginSetup = (
	plugin: PluginDefinition,
	context: PluginSetupContext,
): MaybePromise<unknown> => getPluginRuntimeDefinition(plugin).setup?.(context)

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
	const TName extends string,
	const TSetupResult = undefined,
	const TDependencies extends readonly string[] | undefined = undefined,
	const TOptionalDependencies extends readonly string[] | undefined = undefined,
	const TConflicts extends readonly string[] | undefined = undefined,
	const TPlugins extends readonly PluginDefinition[] | undefined = undefined,
	const TSlot extends string = never,
>(
	options: DefinePluginOptions<
		TName,
		TSetupResult,
		TDependencies,
		TOptionalDependencies,
		TConflicts,
		TPlugins,
		TSlot
	>,
): FrameworkPlugin<
	TName,
	TSetupResult,
	TDependencies,
	TOptionalDependencies,
	TConflicts,
	TPlugins,
	TSlot
> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('plugin options must be a plain object')
	}

	assertNonEmptyString(options.name, 'name')

	if (options.slot !== undefined) {
		assertNonEmptyString(options.slot, 'slot')
	}

	if (options.version !== undefined) {
		assertNonEmptyString(options.version, 'version')
	}

	if (options.setup !== undefined && typeof options.setup !== 'function') {
		throw new TypeError('setup must be a function')
	}

	const runtimeDefinition = immutableRecord({
		setup: options.setup,
		runHook: (
			phase: PluginLifecyclePhase,
			context: PluginLifecycleContext<unknown>,
		): MaybePromise<void> => {
			const hook = options.hooks?.[phase]

			if (hook === undefined) {
				return undefined
			}

			// The manager supplies the export produced by this exact setup callback.
			return hook(context as PluginLifecycleContext<Awaited<TSetupResult>>)
		},
	})
	const plugin = immutableRecord({
		[pluginRuntimeDefinition]: runtimeDefinition,
		name: options.name,
		...(options.slot === undefined ? {} : { slot: options.slot }),
		...(options.version === undefined ? {} : { version: options.version }),
		...(options.dependencies === undefined
			? {}
			: {
					dependencies: normalizePluginNames(
						options.dependencies,
						'dependencies',
					),
				}),
		...(options.optionalDependencies === undefined
			? {}
			: {
					optionalDependencies: normalizePluginNames(
						options.optionalDependencies,
						'optionalDependencies',
					),
				}),
		...(options.conflicts === undefined
			? {}
			: {
					conflicts: normalizePluginNames(options.conflicts, 'conflicts'),
				}),
		...(options.setup === undefined ? {} : { setup: options.setup }),
		...(options.hooks === undefined
			? {}
			: { hooks: normalizeLifecycleHooks(options.hooks) }),
		...(options.plugins === undefined
			? {}
			: { plugins: normalizeNestedPlugins(options.plugins) }),
	})

	declaredPlugins.add(plugin)

	// Each optional container was copied through the generic-preserving normalizer above.
	return plugin as FrameworkPlugin<
		TName,
		TSetupResult,
		TDependencies,
		TOptionalDependencies,
		TConflicts,
		TPlugins,
		TSlot
	>
}
