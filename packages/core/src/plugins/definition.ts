import type { SchemaRegistry } from '@ultimabase/schema'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { ServiceRegistry } from '../services/service-registry.js'

/** Exposes only application-owned registries implemented before plugin setup. */
export interface PluginSetupContext {
	readonly schemas: SchemaRegistry
	readonly services: ServiceRegistry
}

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

interface PluginDefinitionIdentity {
	readonly name: string
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
	TPlugins extends readonly PluginDefinitionIdentity[] | undefined =
		readonly PluginDefinitionIdentity[] | undefined,
> extends PluginDefinitionIdentity {
	readonly name: TName
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
	TPlugins extends readonly PluginDefinitionIdentity[] | undefined,
> {
	readonly name: TName
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

const assertDeclaredPlugin: (
	value: unknown,
	path: string,
) => asserts value is PluginDefinitionIdentity = (value, path) => {
	if (!isPlainRecord(value) || !declaredPlugins.has(value)) {
		throw new TypeError(`${path} must be created by definePlugin`)
	}
}

const normalizeNestedPlugins = <
	const TPlugins extends readonly PluginDefinitionIdentity[],
>(
	plugins: TPlugins,
): readonly [...TPlugins] => {
	const untrustedPlugins: unknown = plugins

	if (!isUnknownArray(untrustedPlugins)) {
		throw new TypeError('plugins must be an array')
	}

	for (const [index, plugin] of untrustedPlugins.entries()) {
		assertDeclaredPlugin(plugin, `plugins[${String(index)}]`)
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
	const TPlugins extends readonly PluginDefinitionIdentity[] | undefined =
		undefined,
>(
	options: DefinePluginOptions<
		TName,
		TSetupResult,
		TDependencies,
		TOptionalDependencies,
		TConflicts,
		TPlugins
	>,
): FrameworkPlugin<
	TName,
	TSetupResult,
	TDependencies,
	TOptionalDependencies,
	TConflicts,
	TPlugins
> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('plugin options must be a plain object')
	}

	assertNonEmptyString(options.name, 'name')

	if (options.version !== undefined) {
		assertNonEmptyString(options.version, 'version')
	}

	if (options.setup !== undefined && typeof options.setup !== 'function') {
		throw new TypeError('setup must be a function')
	}

	const plugin = immutableRecord({
		name: options.name,
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
		TPlugins
	>
}
