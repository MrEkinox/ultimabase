import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { validRange } from 'semver'

import { assertExactEnumerableKeys } from '../exact-object-validation.js'

import type { PluginOperationDeclarationRegistrar } from './application-surface-declarations.js'
import type {
	NormalizedPluginCapabilityDeclarations,
	PluginCapabilityDeclarationOptions,
} from './capabilities.js'
import type {
	PluginDeclaration,
	PluginDeclarationContext,
} from './declaration-host.js'
import {
	assertPluginId,
	formatPluginIdentity,
	type PluginDependency,
	type PluginEnvironmentClaim,
	type PluginManifest,
	type PluginPrivilegeRequest,
} from './manifest.js'
import {
	normalizePluginApplicationResource,
	type PluginApplicationResource,
	type PluginApplicationResourceFactory,
} from './plugin-contributions.js'
import type { PluginSetupContext } from './setup-registries.js'
import type { PluginCommandPlan } from './plugin-command-plan.js'
import type { PluginSourceProjection } from './source-projections.js'

export type { PluginSetupContext } from './setup-registries.js'

interface PluginNativePlan {
	readonly applicationFactory: PluginApplicationResourceFactory | undefined
	readonly commands: PluginCommandPlan
	readonly declare: PluginDeclaration | undefined
}

const hasOperationRegistrar = (
	context: PluginDeclarationContext,
): context is PluginDeclarationContext &
	Readonly<{ operations: PluginOperationDeclarationRegistrar }> =>
	'operations' in context &&
	isPlainRecord(context.operations) &&
	typeof context.operations.declare === 'function'

declare const pluginDefinitionBrand: unique symbol
declare const pluginSetupExportsBrand: unique symbol
declare const pluginSourceProjectionBrand: unique symbol
const pluginNativePlan: unique symbol = Symbol('ultimabase.plugin-native-plan')

/** Identifies definitions whose runtime provenance was validated by Core. */
export interface PluginDefinition {
	readonly [pluginDefinitionBrand]: true
	readonly [pluginSetupExportsBrand]: unknown
	readonly [pluginSourceProjectionBrand]: PluginSourceProjection
	readonly [pluginNativePlan]: PluginNativePlan
	readonly manifest: PluginManifest
	readonly dependencies?: readonly PluginDependency[] | undefined
	readonly optionalDependencies?: readonly PluginDependency[] | undefined
	readonly peers?: readonly PluginDependency[] | undefined
	readonly conflicts?: readonly string[] | undefined
}

/** Names the exact facts carried by one typed plugin definition. */
export interface FrameworkPluginContract {
	readonly id: string
	readonly exports?: unknown
	readonly instanceId?: string | undefined
	readonly version?: string
	readonly core?: string
	readonly dependencies?: readonly PluginDependency[] | undefined
	readonly optionalDependencies?: readonly PluginDependency[] | undefined
	readonly peers?: readonly PluginDependency[] | undefined
	readonly conflicts?: readonly string[] | undefined
	readonly environment?: readonly PluginEnvironmentClaim[] | undefined
	readonly privileges?: readonly PluginPrivilegeRequest[]
	readonly capabilities?: PluginCapabilityDeclarationOptions
	readonly source?: PluginSourceProjection
}

type ContractValue<
	TContract,
	TKey extends PropertyKey,
	TFallback,
	TExpected = unknown,
> =
	TContract extends Readonly<Record<TKey, infer TValue>>
		? TValue extends TExpected
			? TValue
			: TFallback
		: TFallback

/** Carries every exact declaration type into later graph and lookup stages. */
export interface FrameworkPlugin<
	TContract extends FrameworkPluginContract = FrameworkPluginContract,
> extends PluginDefinition {
	readonly [pluginSetupExportsBrand]: Awaited<
		ContractValue<TContract, 'exports', undefined>
	>
	readonly [pluginSourceProjectionBrand]: ContractValue<
		TContract,
		'source',
		never,
		PluginSourceProjection
	>
	readonly manifest: PluginManifest<
		TContract['id'],
		ContractValue<TContract, 'instanceId', undefined, string | undefined>,
		ContractValue<TContract, 'version', string, string>,
		ContractValue<TContract, 'core', string, string>,
		ContractValue<
			TContract,
			'privileges',
			readonly PluginPrivilegeRequest[]
		> extends readonly PluginPrivilegeRequest[]
			? readonly [
					...ContractValue<
						TContract,
						'privileges',
						readonly PluginPrivilegeRequest[]
					>,
				]
			: readonly [],
		ContractValue<
			TContract,
			'environment',
			readonly PluginEnvironmentClaim[]
		> extends readonly PluginEnvironmentClaim[]
			? readonly [
					...ContractValue<
						TContract,
						'environment',
						readonly PluginEnvironmentClaim[]
					>,
				]
			: readonly [],
		NormalizedPluginCapabilityDeclarations<
			ContractValue<
				TContract,
				'capabilities',
				undefined,
				PluginCapabilityDeclarationOptions | undefined
			>
		>
	>
	readonly dependencies?: ContractValue<TContract, 'dependencies', undefined>
	readonly optionalDependencies?: ContractValue<
		TContract,
		'optionalDependencies',
		undefined
	>
	readonly peers?: ContractValue<TContract, 'peers', undefined>
	readonly conflicts?: ContractValue<TContract, 'conflicts', undefined>
}

/** Extracts one plugin's initialized export contract without executing its factory. */
export type PluginExports<TPlugin> = TPlugin extends PluginDefinition
	? TPlugin[typeof pluginSetupExportsBrand]
	: never

/** Reads source-authoring surfaces inferred from one plugin's static definition. */
export type PluginSource<TPlugin> = TPlugin extends PluginDefinition
	? TPlugin[typeof pluginSourceProjectionBrand]
	: never

export interface NativePluginDefinitionOptions {
	readonly manifest: PluginManifest
	readonly plan: PluginNativePlan
	readonly dependencies?: readonly PluginDependency[]
	readonly optionalDependencies?: readonly PluginDependency[]
	readonly peers?: readonly PluginDependency[]
	readonly conflicts?: readonly string[]
}

const declaredPlugins = new WeakSet<object>()

const normalizePluginNames = (
	names: readonly string[],
	path: string,
): readonly string[] => {
	const untrustedNames: unknown = names
	if (!isUnknownArray(untrustedNames)) {
		throw new TypeError(`${path} must be an array`)
	}
	for (const [index, name] of untrustedNames.entries()) {
		assertNonEmptyString(name, `${path}[${String(index)}]`)
	}
	return immutableArray(names)
}

const normalizePluginDependencies = (
	dependencies: readonly PluginDependency[],
	path: string,
): readonly PluginDependency[] => {
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
			assertExactEnumerableKeys(
				dependency,
				new Set(['pluginId', 'version', 'instanceId']),
				`${dependencyPath} contains unknown option: `,
			)

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
	)
}

export const assertPluginDefinition: (
	value: unknown,
	path: string,
) => asserts value is PluginDefinition = (value, path) => {
	if (!isPlainRecord(value) || !declaredPlugins.has(value)) {
		throw new TypeError(`${path} must be created by plugin()`)
	}
}

/** Creates immutable plugin metadata around one already compiled native plan. */
export const createPluginDefinition = (
	options: NativePluginDefinitionOptions,
): PluginDefinition => {
	const plugin = immutableRecord({
		[pluginNativePlan]: immutableRecord(options.plan),
		manifest: options.manifest,
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
		...(options.peers === undefined
			? {}
			: { peers: normalizePluginDependencies(options.peers, 'peers') }),
		...(options.conflicts === undefined
			? {}
			: { conflicts: normalizePluginNames(options.conflicts, 'conflicts') }),
	})
	declaredPlugins.add(plugin)
	return plugin as PluginDefinition
}

/** Creates and validates the application resource owned by one plugin definition. */
export const createPluginApplication = async (
	plugin: PluginDefinition,
	context: PluginSetupContext,
): Promise<PluginApplicationResource<unknown> | undefined> => {
	const create = plugin[pluginNativePlan].applicationFactory
	return create === undefined
		? undefined
		: normalizePluginApplicationResource(await create(context))
}

/** @internal Reads the already compiled command plan without exposing it publicly. */
export const readPluginCommandPlan = (
	plugin: PluginDefinition,
): PluginCommandPlan => plugin[pluginNativePlan].commands

/** Runs one pure synchronous static declaration before schema compilation. */
export const runPluginDeclaration = (
	plugin: PluginDefinition,
	context: PluginDeclarationContext,
): void => {
	const plan = plugin[pluginNativePlan]
	if (plan.commands.declarations.length > 0) {
		if (!hasOperationRegistrar(context)) {
			throw new TypeError(
				`Plugin "${formatPluginIdentity(plugin.manifest.identity)}" requires operation:declare for its operation contributions`,
			)
		}
		for (const operation of plan.commands.declarations) {
			context.operations.declare(operation)
		}
	}

	if (plan.declare === undefined) return

	// JavaScript callers cannot weaken the synchronous declaration boundary.
	const returned = (
		plan.declare as (context: PluginDeclarationContext) => unknown
	)(context)
	if (returned !== undefined) {
		throw new TypeError(
			`Plugin "${formatPluginIdentity(plugin.manifest.identity)}" declare must be synchronous and return nothing`,
		)
	}
}
