import type { Logger } from '../application/application-log.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { PrivateStorageDeclarationRegistrar } from '../private-storage/contracts.js'
import type { PluginFieldFamilyRegistrar } from '../schema/schema/field-builder-methods.js'
import { assertExactPlainObject } from '../exact-object-validation.js'
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
import {
	pluginPrivilegeNames,
	snapshotVocabularyList,
	type PluginPrivilege,
} from './manifest.js'
import type { DerivedPluginPrivilege } from './plugin-permissions.js'
import type { PluginOperationAuthoringContribution } from './plugin-command-contribution-contracts.js'
import type { PluginSchemaDeclarationRegistrar } from './schema-declaration-contracts.js'
import type { PluginSetupContext } from './setup-registries.js'
import type {
	PluginSourceDeclarationResult,
	PluginSourceProjection,
	PluginSourceProjectionFromResult,
} from './source-projections.js'

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
		readonly fields: PluginFieldFamilyRegistrar
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

export interface PluginDeclarationContributionOptions<
	TRequirements extends PluginDeclarationRequirements,
	TSchemaResult = undefined,
	TModelResult = undefined,
	TOperationResult = undefined,
> {
	/** Declares exact static capability reads and contributes them to the plugin graph. */
	readonly requires?: TRequirements
	readonly schema?: (
		context: PluginSchemaContributionContext<TRequirements>,
	) => TSchemaResult
	readonly models?: (
		context: PluginModelContributionContext<TRequirements>,
	) => TModelResult
	readonly operations?: (
		context: PluginOperationDeclarationContributionContext<TRequirements>,
	) => TOperationResult
	readonly privateStorage?: (
		context: PluginPrivateStorageContributionContext<TRequirements>,
	) => undefined
}

declare const declarationContributionType: unique symbol

/** Groups related pure static declarations without exposing Core's declaration host. */
export interface PluginDeclarationContribution<
	TRequirements extends PluginDeclarationRequirements =
		PluginDeclarationRequirements,
	TProjection extends PluginSourceProjection = PluginSourceProjection,
> {
	readonly kind: 'plugin-declaration-contribution'
	readonly requires: TRequirements
	readonly [declarationContributionType]: Readonly<{
		readonly projection: TProjection
		readonly requirements: TRequirements
	}>
}

/** Reads the source projection carried by one static declaration contribution. */
export type PluginDeclarationSource<TContribution> =
	TContribution extends PluginDeclarationContribution<
		infer TRequirements,
		infer TProjection
	>
		? TRequirements extends PluginDeclarationRequirements
			? TProjection
			: never
		: never

type DeclarationSourceProjection<
	TSchemaResult,
	TModelResult,
	TOperationResult,
> = Extract<
	| PluginSourceProjectionFromResult<TSchemaResult>
	| PluginSourceProjectionFromResult<TModelResult>
	| PluginSourceProjectionFromResult<TOperationResult>,
	PluginSourceProjection
>

type DeclarationVoid = ReturnType<() => void>

type UnsupportedDeclarationResult<TResult> = TResult extends DeclarationVoid
	? never
	: TResult extends PluginSourceDeclarationResult
		? never
		: TResult

type ValidDeclarationResult<TResult> = [
	UnsupportedDeclarationResult<TResult>,
] extends [never]
	? unknown
	: never

type ValidDeclarationResults<TSchemaResult, TModelResult, TOperationResult> =
	ValidDeclarationResult<TSchemaResult> &
		ValidDeclarationResult<TModelResult> &
		ValidDeclarationResult<TOperationResult>

type DeclarationCallback = (context: PluginDeclarationContext) => unknown

interface DeclarationContributionRuntime {
	readonly callbacks: readonly DeclarationCallback[]
	readonly privileges: readonly DerivedPluginPrivilege[]
	readonly requires: readonly CapabilityRequirement[]
}

const declarationContributions = new WeakMap<
	object,
	DeclarationContributionRuntime
>()
/**
 * Maps each static declaration surface to the privilege it implies, in run
 * order, with the report sentence used when the plugin gives no reason.
 */
const declarationSurfaces = [
	['schema', 'schema:declare', 'Declares schema fields, options or schemas.'],
	['models', 'model:extend', 'Adds plugin commands to application schemas.'],
	['operations', 'operation:declare', 'Declares plugin operations.'],
	['privateStorage', 'storage:private', 'Declares owner-private storage.'],
] as const satisfies readonly (readonly [string, PluginPrivilege, string])[]
const declarationOptionKeys = new Set([
	'requires',
	...declarationSurfaces.map(([surface]) => surface),
])

const isDeclarationCallback = (value: unknown): value is DeclarationCallback =>
	typeof value === 'function'

const isInertDeclarationResult = (value: unknown): boolean =>
	value === undefined ||
	(Array.isArray(value) &&
		value.every((entry) => isInertDeclarationResult(entry)))

/** Creates one nominal static declaration contribution. */
export const contributeDeclarations = <
	const TRequirements extends PluginDeclarationRequirements = readonly [],
	const TSchemaResult = undefined,
	const TModelResult = undefined,
	const TOperationResult = undefined,
>(
	options: PluginDeclarationContributionOptions<
		TRequirements,
		TSchemaResult,
		TModelResult,
		TOperationResult
	> &
		ValidDeclarationResults<TSchemaResult, TModelResult, TOperationResult>,
): PluginDeclarationContribution<
	TRequirements,
	DeclarationSourceProjection<TSchemaResult, TModelResult, TOperationResult>
> => {
	assertExactPlainObject(
		options,
		declarationOptionKeys,
		'plugin declaration contribution must be a plain object',
		'Unknown plugin declaration contribution option: ',
	)

	const untrustedRequirements: unknown = options.requires ?? []
	if (!isUnknownArray(untrustedRequirements)) {
		throw new TypeError(
			'plugin declaration contribution requires must be an array',
		)
	}
	const requires: CapabilityRequirement[] = []
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
		requires.push(requirement)
	}

	const callbacks: DeclarationCallback[] = []
	const privileges: DerivedPluginPrivilege[] = []
	for (const [surface, privilege, description] of declarationSurfaces) {
		const callback: unknown = options[surface]
		if (callback === undefined) continue
		if (!isDeclarationCallback(callback)) {
			throw new TypeError(
				`plugin declaration contribution ${surface} must be a function`,
			)
		}
		callbacks.push(callback)
		privileges.push(immutableRecord({ privilege, description }))
	}
	if (callbacks.length === 0) {
		throw new TypeError(
			'plugin declaration contribution must declare at least one static surface',
		)
	}

	const contribution = immutableRecord({
		kind: 'plugin-declaration-contribution' as const,
		requires: immutableArray(requires) as TRequirements,
	})
	declarationContributions.set(
		contribution,
		immutableRecord({
			callbacks: immutableArray(callbacks),
			privileges: immutableArray(privileges),
			requires: contribution.requires,
		}),
	)
	return contribution as PluginDeclarationContribution<
		TRequirements,
		DeclarationSourceProjection<TSchemaResult, TModelResult, TOperationResult>
	>
}

/** @internal Resolves only nominal static contributions. */
export const getPluginDeclarationContribution = (
	value: object,
): DeclarationContributionRuntime | undefined =>
	declarationContributions.get(value)

/** @internal Runs one contribution's callbacks through the privilege-scoped host. */
export const runPluginDeclarationContribution = (
	runtime: DeclarationContributionRuntime,
	context: PluginDeclarationContext,
): void => {
	for (const callback of runtime.callbacks) {
		if (!isInertDeclarationResult(callback(context))) {
			throw new TypeError(
				'plugin declaration contribution callbacks may return only Core declaration receipts',
			)
		}
	}
}

/** Given to each start phase of a plugin application resource (ADR-0313). */
export interface PluginStartContext {
	/** The same plugin-prefixed logger as the setup context. */
	readonly logger: Logger
}

interface PluginApplicationLifecycle {
	readonly connect?: (context: PluginStartContext) => MaybePromise<void>
	readonly prepareSchema?: (context: PluginStartContext) => MaybePromise<void>
	readonly startRuntime?: (context: PluginStartContext) => MaybePromise<void>
	readonly startTransports?: (context: PluginStartContext) => MaybePromise<void>
	/**
	 * Runs once every start phase has completed and the application accepts
	 * queries, before `start()` resolves; a failure fails `start()`. Seeding
	 * work, such as Roles `ensure` (ADR-0322), belongs here.
	 */
	readonly ready?: (context: PluginStartContext) => MaybePromise<void>
	readonly stop?: () => MaybePromise<void>
	readonly dispose?: () => MaybePromise<void>
}

/** Owns one plugin's public exports and application lifecycle callbacks. */
export interface PluginApplicationResource<
	TExports,
> extends PluginApplicationLifecycle {
	readonly exports: TExports
}

export type PluginApplicationFactory<TExports> = (
	context: PluginSetupContext,
) => MaybePromise<PluginApplicationResource<TExports>>

type PluginApplicationResourceInput = PluginApplicationLifecycle &
	Readonly<{ readonly exports?: unknown }>

/** @internal Carries the inferred resource shape until Core normalizes it. */
export type PluginApplicationResourceFactory = (
	context: PluginSetupContext,
) => MaybePromise<PluginApplicationResourceInput>

/** Names every application-resource lifecycle boundary Core may invoke. */
export type PluginApplicationLifecyclePhase = keyof PluginApplicationLifecycle

/** @internal Lists lifecycle keys accepted from an application resource. */
export const pluginApplicationLifecyclePhases: readonly PluginApplicationLifecyclePhase[] =
	immutableArray([
		'connect',
		'prepareSchema',
		'startRuntime',
		'startTransports',
		'ready',
		'stop',
		'dispose',
	])
const applicationResourceKeys = new Set([
	'exports',
	...pluginApplicationLifecyclePhases,
])

declare const applicationContributionType: unique symbol

/** Represents one application-local resource contribution. */
export interface PluginApplicationContribution<TExports = unknown> {
	readonly kind: 'plugin-application-contribution'
	readonly [applicationContributionType]: TExports
}

const applicationContributions = new WeakMap<
	object,
	PluginApplicationResourceFactory
>()

type NormalizedPluginApplicationExports<TExports> = TExports extends undefined
	? ReturnType<() => void>
	: TExports

interface ContributeApplication {
	<const TExports>(
		create: PluginApplicationFactory<TExports>,
	): PluginApplicationContribution<NormalizedPluginApplicationExports<TExports>>
	(
		create: (
			context: PluginSetupContext,
		) => MaybePromise<
			PluginApplicationLifecycle & Readonly<{ readonly exports?: never }>
		>,
	): PluginApplicationContribution<ReturnType<() => void>>
}

const createApplicationContribution = (
	create: PluginApplicationResourceFactory,
): PluginApplicationContribution => {
	if (typeof create !== 'function') {
		throw new TypeError('plugin application contribution must be a function')
	}
	const contribution = immutableRecord({
		kind: 'plugin-application-contribution' as const,
	})
	applicationContributions.set(contribution, create)
	return contribution as PluginApplicationContribution
}

/** Creates one application-local export and lifecycle resource. */
export const contributeApplication =
	createApplicationContribution as ContributeApplication

/** @internal Resolves only nominal application contributions. */
export const getPluginApplicationFactory = (
	value: object,
): PluginApplicationResourceFactory | undefined =>
	applicationContributions.get(value)

/** @internal Validates and snapshots the resource created for one application. */
export const normalizePluginApplicationResource = (
	value: unknown,
): PluginApplicationResource<unknown> => {
	assertExactPlainObject(
		value,
		applicationResourceKeys,
		'plugin application resource must be a plain object',
		'Unknown plugin application resource option: ',
	)
	const lifecycle = pluginApplicationLifecyclePhases.flatMap(
		(phase): [string, unknown][] => {
			const callback = value[phase]
			if (callback === undefined) return []
			if (typeof callback !== 'function') {
				throw new TypeError(
					`plugin application resource ${phase} must be a function`,
				)
			}
			return [[phase, callback]]
		},
	)

	return immutableRecord({
		exports: value.exports,
		...Object.fromEntries(lifecycle),
	})
}

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
	if (isUnknownArray(untrustedPrivileges) && untrustedPrivileges.length === 0) {
		throw new TypeError(
			'plugin contribution privileges must be a non-empty array',
		)
	}
	const names = snapshotVocabularyList(
		untrustedPrivileges,
		pluginPrivilegeNames,
		{
			notArray: 'plugin contribution privileges must be a non-empty array',
			unknown: (index) =>
				`plugin contribution privileges[${String(index)}] must be a concrete PluginPrivilege`,
			duplicate: (privilege) =>
				`Duplicate plugin contribution privilege: ${privilege}`,
		},
	)
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
		privileges: names as TPrivileges,
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
