import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { PrivateStorageDeclarationRegistrar } from '../private-storage/contracts.js'
import type { FieldBuilderMethodRegistrar } from '../schema/schema/field-builder-methods.js'
import type {
	PluginModelSurfaceRegistrar,
	PluginOperationDeclarationRegistrar,
} from './application-surface-declarations.js'
import {
	assertCapabilityRequirement,
	type CapabilityRequirement,
	type PluginCapabilityDeclaration,
} from './capabilities.js'
import type {
	PluginDeclarationCapabilityReader,
	PluginDeclarationContext,
} from './declaration-host.js'
import type { PluginLifecyclePhase, PluginSetupContext } from './definition.js'
import { pluginPrivilegeMetadata, type PluginPrivilege } from './manifest.js'
import type { PluginOperationAuthoringContribution } from './plugin-operation-contributions.js'
import type { PluginSchemaDeclarationRegistrar } from './schema-declarations.js'
import type { TypegenReferenceRegistrar } from './typegen-declarations.js'

/** Lists static capability reads owned by one declaration contribution. */
export type PluginDeclarationRequirements = readonly CapabilityRequirement[]

type DeclarationCapabilities<
	TRequirements extends PluginDeclarationRequirements,
> = Readonly<{
	readonly capabilities: PluginDeclarationCapabilityReader<TRequirements>
}>

/** Supplies only schema-owned static registrars. */
export type PluginSchemaContributionContext<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> = DeclarationCapabilities<TRequirements> &
	Readonly<{
		readonly fields: FieldBuilderMethodRegistrar
		readonly schemas: PluginSchemaDeclarationRegistrar
	}>

/** Supplies only application model-surface registration. */
export type PluginModelContributionContext<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> = DeclarationCapabilities<TRequirements> &
	Readonly<{ readonly models: PluginModelSurfaceRegistrar }>

/** Supplies only token-only operation registration. */
export type PluginOperationDeclarationContributionContext<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> = DeclarationCapabilities<TRequirements> &
	Readonly<{ readonly operations: PluginOperationDeclarationRegistrar }>

/** Supplies only private-storage registration. */
export type PluginPrivateStorageContributionContext<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> = DeclarationCapabilities<TRequirements> &
	Readonly<{ readonly privateStorage: PrivateStorageDeclarationRegistrar }>

/** Supplies only public Typegen reference registration. */
export type PluginTypegenContributionContext<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> = DeclarationCapabilities<TRequirements> &
	Readonly<{ readonly typegenReferences: TypegenReferenceRegistrar }>

export interface PluginDeclarationContributionOptions<
	TRequirements extends PluginDeclarationRequirements,
> {
	/** Declares exact static capability reads and contributes them to the plugin graph. */
	readonly requires?: TRequirements
	readonly schema?: (
		context: PluginSchemaContributionContext<TRequirements>,
	) => undefined
	readonly models?: (
		context: PluginModelContributionContext<TRequirements>,
	) => undefined
	readonly operations?: (
		context: PluginOperationDeclarationContributionContext<TRequirements>,
	) => undefined
	readonly privateStorage?: (
		context: PluginPrivateStorageContributionContext<TRequirements>,
	) => undefined
	readonly typegen?: (
		context: PluginTypegenContributionContext<TRequirements>,
	) => undefined
}

declare const declarationContributionType: unique symbol

/** Groups related pure static declarations without exposing Core's declaration host. */
export interface PluginDeclarationContribution<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
> {
	readonly kind: 'plugin-declaration-contribution'
	readonly requires: TRequirements
	readonly [declarationContributionType]: TRequirements
}

type DeclarationCallback = (context: PluginDeclarationContext) => unknown

interface DeclarationContributionRuntime {
	readonly callbacks: readonly DeclarationCallback[]
	readonly privileges: readonly PluginPrivilege[]
}

const declarationContributions = new WeakMap<
	object,
	DeclarationContributionRuntime
>()
const declarationOptionKeys = new Set([
	'models',
	'operations',
	'privateStorage',
	'requires',
	'schema',
	'typegen',
])

const assertCallback = (value: unknown, path: string): void => {
	if (value !== undefined && typeof value !== 'function') {
		throw new TypeError(`${path} must be a function`)
	}
}

/** Creates one nominal static declaration contribution. */
export const contributeDeclarations = <
	const TRequirements extends PluginDeclarationRequirements = readonly [],
>(
	options: PluginDeclarationContributionOptions<TRequirements>,
): PluginDeclarationContribution<TRequirements> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'plugin declaration contribution must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !declarationOptionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin declaration contribution option: ${String(key)}`,
			)
		}
	}

	const untrustedRequirements: unknown = options.requires ?? []
	if (!isUnknownArray(untrustedRequirements)) {
		throw new TypeError(
			'plugin declaration contribution requires must be an array',
		)
	}
	for (const [index, requirement] of untrustedRequirements.entries()) {
		assertCapabilityRequirement(
			requirement,
			`plugin declaration contribution requires[${String(index)}]`,
		)
		if (requirement.token.lifetime !== 'declaration') {
			throw new TypeError(
				'plugin declaration contributions may require only declaration capabilities',
			)
		}
	}

	assertCallback(options.schema, 'plugin declaration contribution schema')
	assertCallback(options.models, 'plugin declaration contribution models')
	assertCallback(
		options.operations,
		'plugin declaration contribution operations',
	)
	assertCallback(
		options.privateStorage,
		'plugin declaration contribution privateStorage',
	)
	assertCallback(options.typegen, 'plugin declaration contribution typegen')

	const callbacks: DeclarationCallback[] = []
	const privileges: PluginPrivilege[] = []
	const append = (
		privilege: PluginPrivilege,
		callback: DeclarationCallback | undefined,
	): void => {
		if (callback === undefined) return
		callbacks.push(callback)
		if (!privileges.includes(privilege)) privileges.push(privilege)
	}

	append('schema:declare', options.schema as DeclarationCallback | undefined)
	append('model:extend', options.models as DeclarationCallback | undefined)
	append(
		'operation:declare',
		options.operations as DeclarationCallback | undefined,
	)
	append(
		'storage:private',
		options.privateStorage as DeclarationCallback | undefined,
	)
	append(
		'typegen:reference',
		options.typegen as DeclarationCallback | undefined,
	)

	if (callbacks.length === 0) {
		throw new TypeError(
			'plugin declaration contribution must declare at least one static surface',
		)
	}

	const contribution = immutableRecord({
		kind: 'plugin-declaration-contribution' as const,
		requires: immutableArray(untrustedRequirements) as TRequirements,
	})
	declarationContributions.set(
		contribution,
		immutableRecord({
			callbacks: immutableArray(callbacks),
			privileges: immutableArray(privileges),
		}),
	)
	return contribution as PluginDeclarationContribution<TRequirements>
}

/** @internal Resolves only nominal static contributions. */
export const getPluginDeclarationContribution = (
	value: unknown,
): DeclarationContributionRuntime | undefined =>
	isPlainRecord(value) ? declarationContributions.get(value) : undefined

/** @internal Runs one contribution through the already privilege-scoped host. */
export const runPluginDeclarationContribution = (
	contribution: PluginDeclarationContribution,
	context: PluginDeclarationContext,
): void => {
	const runtime = declarationContributions.get(contribution)
	if (runtime === undefined) {
		throw new TypeError(
			'plugin declaration contribution must be created by contributeDeclarations',
		)
	}
	for (const callback of runtime.callbacks) {
		if (callback(context) !== undefined) {
			throw new TypeError(
				'plugin declaration contribution callbacks must return nothing',
			)
		}
	}
}

/** Owns one plugin's public exports and application lifecycle callbacks. */
export interface PluginApplicationResource<TExports> {
	readonly exports: TExports
	readonly connect?: () => MaybePromise<void>
	readonly prepareSchema?: () => MaybePromise<void>
	readonly startRuntime?: () => MaybePromise<void>
	readonly startTransports?: () => MaybePromise<void>
	readonly stop?: () => MaybePromise<void>
	readonly dispose?: () => MaybePromise<void>
}

export type PluginApplicationFactory<TExports> = (
	context: PluginSetupContext,
) => MaybePromise<PluginApplicationResource<TExports>>

declare const applicationContributionType: unique symbol

/** Represents one application-local resource contribution. */
export interface PluginApplicationContribution<TExports = unknown> {
	readonly kind: 'plugin-application-contribution'
	readonly [applicationContributionType]: TExports
}

const applicationContributions = new WeakMap<
	object,
	PluginApplicationFactory<unknown>
>()

type NormalizedPluginApplicationExports<TExports> = TExports extends undefined
	? ReturnType<() => void>
	: TExports

/** Creates one application-local export and lifecycle resource. */
export const contributeApplication = <const TExports>(
	create: PluginApplicationFactory<TExports>,
): PluginApplicationContribution<
	NormalizedPluginApplicationExports<TExports>
> => {
	if (typeof create !== 'function') {
		throw new TypeError('plugin application contribution must be a function')
	}
	const contribution = immutableRecord({
		kind: 'plugin-application-contribution' as const,
	})
	applicationContributions.set(contribution, create)
	return contribution as PluginApplicationContribution<
		NormalizedPluginApplicationExports<TExports>
	>
}

/** @internal Resolves only nominal application contributions. */
export const getPluginApplicationFactory = (
	value: unknown,
): PluginApplicationFactory<unknown> | undefined =>
	isPlainRecord(value) ? applicationContributions.get(value) : undefined

declare const privilegedContributionType: unique symbol

/** Attaches otherwise non-inferable Core facade uses to one exact contribution. */
export interface PluginPrivilegedContribution<
	TContribution extends PluginContribution = PluginContribution,
	TPrivileges extends readonly PluginPrivilege[] = readonly PluginPrivilege[],
> {
	readonly kind: 'plugin-privileged-contribution'
	readonly contribution: TContribution
	readonly privileges: TPrivileges
	readonly [privilegedContributionType]: TPrivileges
}

const privilegedContributions = new WeakSet<object>()

/** Declares additional callback privileges at the contribution that uses them. */
export const withPluginPrivileges = <
	const TContribution extends PluginContribution,
	const TPrivileges extends readonly PluginPrivilege[],
>(
	contribution: TContribution,
	privileges: TPrivileges,
): PluginPrivilegedContribution<TContribution, TPrivileges> => {
	const untrustedPrivileges: unknown = privileges
	if (
		!isUnknownArray(untrustedPrivileges) ||
		untrustedPrivileges.length === 0
	) {
		throw new TypeError(
			'plugin contribution privileges must be a non-empty array',
		)
	}
	const names = new Set<PluginPrivilege>()
	for (const [index, privilege] of untrustedPrivileges.entries()) {
		if (
			typeof privilege !== 'string' ||
			!Object.hasOwn(pluginPrivilegeMetadata, privilege)
		) {
			throw new TypeError(
				`plugin contribution privileges[${String(index)}] must be a concrete PluginPrivilege`,
			)
		}
		if (names.has(privilege as PluginPrivilege)) {
			throw new TypeError(
				`Duplicate plugin contribution privilege: ${privilege}`,
			)
		}
		names.add(privilege as PluginPrivilege)
	}
	if (
		isPlainRecord(contribution) &&
		privilegedContributions.has(contribution)
	) {
		throw new TypeError(
			'plugin privilege contribution wrappers cannot be nested',
		)
	}
	const wrapped = immutableRecord({
		contribution,
		kind: 'plugin-privileged-contribution' as const,
		privileges: immutableArray(untrustedPrivileges) as TPrivileges,
	})
	privilegedContributions.add(wrapped)
	return wrapped as PluginPrivilegedContribution<TContribution, TPrivileges>
}

/** @internal Rejects structural privilege wrappers. */
export const isPluginPrivilegedContribution = (
	value: unknown,
): value is PluginPrivilegedContribution =>
	isPlainRecord(value) && privilegedContributions.has(value)

/** Every public value accepted by the contribution-first plugin factory. */
export type PluginContribution =
	| PluginCapabilityDeclaration
	| PluginOperationAuthoringContribution
	| PluginDeclarationContribution
	| PluginApplicationContribution
	| PluginPrivilegedContribution

/** @internal Lists lifecycle keys accepted from an application resource. */
export const pluginApplicationLifecyclePhases: readonly PluginLifecyclePhase[] =
	immutableArray([
		'connect',
		'prepareSchema',
		'startRuntime',
		'startTransports',
		'stop',
		'dispose',
	])
