import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { PluginCapabilityDeclarationOptions } from './capabilities.js'
import {
	definePlugin,
	type DefinePluginOptions,
	type FrameworkPlugin,
} from './definition.js'
import type {
	PluginDependency,
	PluginEnvironmentClaim,
	PluginPrivilegeRequest,
} from './manifest.js'

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

/** Creates exact plugin instances from one immutable package identity. */
export interface PluginModule<
	TPluginId extends string,
	TVersion extends string,
	TCoreRange extends string,
> {
	readonly core: TCoreRange
	readonly pluginId: TPluginId
	readonly version: TVersion
	/** Creates one immutable Core plugin definition from the module's stable facts. */
	plugin<
		const TSetupResult = undefined,
		const TDependencies extends readonly PluginDependency[] | undefined =
			undefined,
		const TOptionalDependencies extends
			readonly PluginDependency[] | undefined = undefined,
		const TConflicts extends readonly string[] | undefined = undefined,
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

type DefinitionProperty<TDefinition, TKey extends PropertyKey> =
	TKey extends keyof TDefinition ? TDefinition[TKey] : undefined

type DefinitionSetupResult<TDefinition> =
	TDefinition extends Readonly<{
		readonly setup: (...arguments_: never[]) => infer TResult
	}>
		? TResult
		: undefined

/**
 * Derives one exact plugin type from property-based definition facts.
 * This is the compact public alternative to spelling FrameworkPlugin's tuple.
 */
export type PluginModuleInstance<
	TModule extends PluginModule<string, string, string>,
	TDefinition,
> =
	TModule extends PluginModule<
		infer TPluginId,
		infer TVersion,
		infer TCoreRange
	>
		? FrameworkPlugin<
				TPluginId,
				DefinitionSetupResult<TDefinition>,
				Extract<
					DefinitionProperty<TDefinition, 'dependencies'>,
					readonly PluginDependency[] | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'optionalDependencies'>,
					readonly PluginDependency[] | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'conflicts'>,
					readonly string[] | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'instanceId'>,
					string | undefined
				>,
				TVersion,
				TCoreRange,
				Extract<
					DefinitionProperty<TDefinition, 'privileges'>,
					readonly PluginPrivilegeRequest[] | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'environment'>,
					readonly PluginEnvironmentClaim[] | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'capabilities'>,
					PluginCapabilityDeclarationOptions | undefined
				>,
				Extract<
					DefinitionProperty<TDefinition, 'peers'>,
					readonly PluginDependency[] | undefined
				>
			>
		: never

/** Binds immutable package identity once for every configured plugin instance. */
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

		return definePlugin({ ...definition, core, pluginId, version })
	}

	return immutableRecord({ core, plugin, pluginId, version })
}
