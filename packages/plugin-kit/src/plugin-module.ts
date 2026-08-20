import {
	definePlugin,
	type DefinePluginOptions,
	type FrameworkPlugin,
	type PluginCapabilityDeclarationOptions,
	type PluginDefinition,
	type PluginDependency,
	type PluginEnvironmentClaim,
	type PluginPrivilegeRequest,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/** Fixes the package-owned manifest facts shared by every configured instance. */
export interface DefinePluginModuleOptions<
	TPluginId extends string,
	TVersion extends string,
	TCoreRange extends string,
> {
	/** Declares the stable namespaced plugin identity. @example "community.workflow" */
	readonly pluginId: TPluginId
	/** Declares the package version recorded in provenance. @example "1.2.0" */
	readonly version: TVersion
	/** Declares the supported Core semantic-version range. @example "^1.0.0" */
	readonly core: TCoreRange
}

/** Supplies one instance with every Core option except package-owned manifest facts. */
export type PluginModuleDefinitionOptions<
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
	TPeers extends readonly PluginDependency[] | undefined,
> = Omit<
	DefinePluginOptions<
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
		TCapabilities,
		TPeers
	>,
	'core' | 'pluginId' | 'version'
>

/** Defines exact plugin instances while leaving every privilege visible to Core. */
export interface PluginModule<
	TPluginId extends string,
	TVersion extends string,
	TCoreRange extends string,
> {
	readonly core: TCoreRange
	readonly pluginId: TPluginId
	readonly version: TVersion
	/**
	 * Creates one immutable Core plugin definition from the module's stable facts.
	 *
	 * @example `workflowModule.plugin({ privileges, setup })`
	 */
	plugin<
		const TSetupResult = undefined,
		const TDependencies extends readonly PluginDependency[] | undefined =
			undefined,
		const TOptionalDependencies extends
			readonly PluginDependency[] | undefined = undefined,
		const TConflicts extends readonly string[] | undefined = undefined,
		const TPlugins extends readonly PluginDefinition[] | undefined = undefined,
		const TInstanceId extends string | undefined = undefined,
		const TPrivileges extends readonly PluginPrivilegeRequest[] | undefined =
			undefined,
		const TEnvironment extends readonly PluginEnvironmentClaim[] | undefined =
			undefined,
		const TCapabilities extends PluginCapabilityDeclarationOptions | undefined =
			undefined,
		const TPeers extends readonly PluginDependency[] | undefined = undefined,
	>(
		options: PluginModuleDefinitionOptions<
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
			TCapabilities,
			TPeers
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
		TCapabilities,
		TPeers
	>
}

const moduleOptionKeys = new Set(['core', 'pluginId', 'version'])
const fixedDefinitionKeys = new Set(['core', 'pluginId', 'version'])

/**
 * Binds package identity once so every exported plugin factory stays consistent.
 * Core still validates the manifest, binds its owner, and enforces its privileges.
 *
 * @example
 * ```ts
 * const workflow = definePluginModule({
 *   pluginId: 'community.workflow',
 *   version: '1.0.0',
 *   core: '^1.0.0',
 * })
 * export const workflowPlugin = () => workflow.plugin({ setup: () => ({}) })
 * ```
 */
export const definePluginModule = <
	const TPluginId extends string,
	const TVersion extends string,
	const TCoreRange extends string,
>(
	options: DefinePluginModuleOptions<TPluginId, TVersion, TCoreRange>,
): PluginModule<TPluginId, TVersion, TCoreRange> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('plugin module options must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !moduleOptionKeys.has(key)) {
			throw new TypeError(`Unknown plugin module option: ${String(key)}`)
		}
	}
	assertNonEmptyString(options.pluginId, 'plugin module pluginId')
	assertNonEmptyString(options.version, 'plugin module version')
	assertNonEmptyString(options.core, 'plugin module core range')
	const core = options.core
	const pluginId = options.pluginId
	const version = options.version

	const plugin: PluginModule<TPluginId, TVersion, TCoreRange>['plugin'] = (
		definition,
	) => {
		if (!isPlainRecord(definition)) {
			throw new TypeError('plugin module definition must be a plain object')
		}
		for (const key of fixedDefinitionKeys) {
			if (Object.hasOwn(definition, key)) {
				throw new TypeError(
					`plugin module definition cannot override package-owned ${key}`,
				)
			}
		}

		return definePlugin({
			...definition,
			core,
			pluginId,
			version,
		})
	}

	return immutableRecord({
		core,
		plugin,
		pluginId,
		version,
	})
}
