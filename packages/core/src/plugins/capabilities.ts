import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { satisfies, valid, validRange } from 'semver'

import {
	snapshotJsonValue,
	type JsonValue,
} from '../schema/fields/builtins/json.js'
import type { CompiledSchemaRegistry } from '../schema/index.js'
import type { DatabaseConstraintCompilerReader } from './constraint-compilers.js'
import type { PluginIdentity } from './manifest.js'

/** Determines how compatible provider declarations compose in one application. */
export type CapabilityCardinality = 'single' | 'multiple' | 'pipeline'

/** Determines when a capability value may exist. */
export type CapabilityLifetime = 'declaration' | 'application'

declare const capabilityTokenBrand: unique symbol
declare const capabilityProviderType: unique symbol
declare const capabilityConsumerType: unique symbol

/**
 * Identifies one independently versioned plugin protocol.
 *
 * Import the token exported by the protocol owner. Recreating matching metadata
 * does not recreate its nominal identity.
 */
export interface CapabilityToken<
	TProvider = unknown,
	TConsumer = TProvider,
	TCapabilityId extends string = string,
	TVersion extends string = string,
	TCardinality extends CapabilityCardinality = CapabilityCardinality,
	TLifetime extends CapabilityLifetime = CapabilityLifetime,
> {
	readonly [capabilityTokenBrand]: true
	readonly [capabilityProviderType]: TProvider
	readonly [capabilityConsumerType]: TConsumer
	readonly kind: 'capability-token'
	readonly capabilityId: TCapabilityId
	readonly version: TVersion
	readonly cardinality: TCardinality
	readonly lifetime: TLifetime
}

/** Extracts the exact value accepted from a capability provider. */
export type CapabilityProviderValue<TToken extends CapabilityToken> =
	TToken[typeof capabilityProviderType]

/** Extracts the exact value exposed to a capability consumer. */
export type CapabilityConsumerValue<TToken extends CapabilityToken> =
	TToken[typeof capabilityConsumerType]

/** Supplies the cardinality-specific final provider sequence to one protocol. */
export type CapabilityCompositionInput<
	TProvider,
	TCardinality extends CapabilityCardinality,
> = TCardinality extends 'single' ? readonly [TProvider] : readonly TProvider[]

/** Converts the selected provider sequence into the exact public consumer view. */
export type CapabilityComposer<
	TProvider,
	TConsumer,
	TCardinality extends CapabilityCardinality,
> = (
	providers: CapabilityCompositionInput<TProvider, TCardinality>,
) => TConsumer

/** Configures one static, independently versioned protocol identity. */
export interface DefineCapabilityOptions<
	TProvider,
	TConsumer,
	TCapabilityId extends string,
	TVersion extends string,
	TCardinality extends CapabilityCardinality,
	TLifetime extends CapabilityLifetime,
> {
	/** Stable namespaced protocol identity. @example "community.audit-sink" */
	readonly capabilityId: TCapabilityId
	/** Canonical semantic protocol version. @example "1.2.0" */
	readonly version: TVersion
	/** Declares whether one, several, or an ordered pipeline of providers compose. */
	readonly cardinality: TCardinality
	/** Declares whether values are static facts or application-local resources. */
	readonly lifetime: TLifetime
	/** Deterministically converts final ordered providers into one consumer view. */
	readonly compose: CapabilityComposer<TProvider, TConsumer, TCardinality>
}

/** Creates exact token metadata after the protocol selects its value types. */
export type DefineCapabilityFactory<TProvider, TConsumer = TProvider> = <
	const TCapabilityId extends string,
	const TVersion extends string,
	const TCardinality extends CapabilityCardinality,
	const TLifetime extends CapabilityLifetime,
>(
	options: DefineCapabilityOptions<
		TProvider,
		TConsumer,
		TCapabilityId,
		TVersion,
		TCardinality,
		TLifetime
	>,
) => CapabilityToken<
	TProvider,
	TConsumer,
	TCapabilityId,
	TVersion,
	TCardinality,
	TLifetime
>

const capabilityIdPattern =
	/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)$/
const capabilityTokens = new WeakSet<object>()
const capabilityComposers = new WeakMap<
	object,
	(providers: readonly unknown[]) => unknown
>()
const defineCapabilityOptionKeys = new Set([
	'capabilityId',
	'version',
	'cardinality',
	'lifetime',
	'compose',
])

/** Defines one nominal capability protocol without installing a provider. */
export const defineCapability =
	<TProvider, TConsumer = TProvider>(): DefineCapabilityFactory<
		TProvider,
		TConsumer
	> =>
	<
		const TCapabilityId extends string,
		const TVersion extends string,
		const TCardinality extends CapabilityCardinality,
		const TLifetime extends CapabilityLifetime,
	>(
		options: DefineCapabilityOptions<
			TProvider,
			TConsumer,
			TCapabilityId,
			TVersion,
			TCardinality,
			TLifetime
		>,
	): CapabilityToken<
		TProvider,
		TConsumer,
		TCapabilityId,
		TVersion,
		TCardinality,
		TLifetime
	> => {
		const untrustedOptions: unknown = options

		if (!isPlainRecord(untrustedOptions)) {
			throw new TypeError('defineCapability options must be a plain object')
		}

		for (const key of Object.keys(untrustedOptions)) {
			if (!defineCapabilityOptionKeys.has(key)) {
				throw new TypeError(`defineCapability contains unknown option: ${key}`)
			}
		}

		assertNonEmptyString(options.capabilityId, 'capabilityId')
		if (!capabilityIdPattern.test(options.capabilityId)) {
			throw new TypeError(
				'capabilityId must be a namespaced capability identifier',
			)
		}

		assertNonEmptyString(options.version, 'capability version')
		if (valid(options.version) !== options.version) {
			throw new TypeError(
				'capability version must be a canonical semantic version',
			)
		}

		if (
			options.cardinality !== 'single' &&
			options.cardinality !== 'multiple' &&
			options.cardinality !== 'pipeline'
		) {
			throw new TypeError(
				'capability cardinality must be single, multiple, or pipeline',
			)
		}

		if (
			options.lifetime !== 'declaration' &&
			options.lifetime !== 'application'
		) {
			throw new TypeError(
				'capability lifetime must be declaration or application',
			)
		}

		if (typeof options.compose !== 'function') {
			throw new TypeError('capability compose must be a function')
		}

		const token = immutableRecord({
			kind: 'capability-token' as const,
			capabilityId: options.capabilityId,
			version: options.version,
			cardinality: options.cardinality,
			lifetime: options.lifetime,
		})

		capabilityTokens.add(token)
		capabilityComposers.set(
			token,
			options.compose as (providers: readonly unknown[]) => unknown,
		)

		// The private provenance set supplies the nominal runtime half of the type brand.
		return token as CapabilityToken<
			TProvider,
			TConsumer,
			TCapabilityId,
			TVersion,
			TCardinality,
			TLifetime
		>
	}

/** Marks the one plugin responsible for emitting generated application contracts. */
export interface TypegenEmitterCapability {
	readonly kind: 'typegen-emitter'
}

/** Replaces the legacy schema-typegen string slot with one nominal protocol. */
export const typegenEmitterCapability: CapabilityToken<
	TypegenEmitterCapability,
	TypegenEmitterCapability,
	'ultimabase.typegen-emitter',
	'1.0.0',
	'single',
	'declaration'
> = defineCapability<TypegenEmitterCapability>()({
	capabilityId: 'ultimabase.typegen-emitter',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})

/** Runs the trusted token-owned composition without exposing it through inspection. */
export const composeCapability = <TToken extends CapabilityToken>(
	token: TToken,
	providers: CapabilityCompositionInput<
		CapabilityProviderValue<TToken>,
		TToken['cardinality']
	>,
): CapabilityConsumerValue<TToken> => {
	assertCapabilityToken(token, 'capability composition token')
	const compose = capabilityComposers.get(token)

	if (compose === undefined) {
		throw new TypeError('Unknown capability composer')
	}

	return compose(providers)
}

/** Rejects structurally forged tokens at plugin declaration boundaries. */
export const assertCapabilityToken: (
	value: unknown,
	path: string,
) => asserts value is CapabilityToken = (value, path) => {
	if (!isPlainRecord(value) || !capabilityTokens.has(value)) {
		throw new TypeError(`${path} must be created by defineCapability`)
	}
}

/** Identifies one exact owner-local capability contribution. */
export interface CapabilityContributionTarget {
	readonly owner: PluginIdentity
	readonly contributionId: string
}

/** Owns one application provider value and its optional deterministic cleanup. */
export interface ApplicationCapabilityResource<TProvider> {
	readonly value: TProvider
	readonly dispose?: () => MaybePromise<void>
}

/** Reads only capability requirements declared by the current plugin owner. */
export interface PluginCapabilityReader<
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	get<TToken extends CapabilityToken, TRange extends string>(
		requirement: CapabilityRequirement<TToken, false, TRange, TPhase>,
	): CapabilityConsumerValue<TToken>
	get<TToken extends CapabilityToken, TRange extends string>(
		requirement: CapabilityRequirement<TToken, true, TRange, TPhase>,
	): CapabilityConsumerValue<TToken> | undefined
}

/** Supplies an application provider with owner-bound declared capability reads. */
export interface ApplicationCapabilityFactoryContext {
	readonly capabilities: PluginCapabilityReader<'materialization'>
	/** Reads live owner-attributed compilers only with active adapter consumption authority. */
	readonly constraintCompilers: DatabaseConstraintCompilerReader
	/** Reads the complete compiled application schema graph without mutating it. */
	readonly schemas: CompiledSchemaRegistry
}

/** Creates one application-local provider without exposing it in static metadata. */
export type ApplicationCapabilityFactory<TProvider> = (
	context: ApplicationCapabilityFactoryContext,
) => MaybePromise<ApplicationCapabilityResource<TProvider>>

interface CapabilityContributionBase<TToken extends CapabilityToken> {
	readonly token: TToken
	readonly contributionId: string
}

/** Declares one exact provider without selecting or composing it. */
export type CapabilityProviderDeclaration<
	TToken extends CapabilityToken = CapabilityToken,
> =
	TToken extends CapabilityToken<
		infer TProvider,
		unknown,
		string,
		string,
		CapabilityCardinality,
		infer TLifetime
	>
		? TLifetime extends 'declaration'
			? Readonly<{
					kind: 'capability-provider'
				}> &
					CapabilityContributionBase<TToken> &
					Readonly<{
						value: TProvider
					}>
			: Readonly<{
					kind: 'capability-provider'
				}> &
					CapabilityContributionBase<TToken>
		: never

const capabilityProviders = new WeakSet<object>()
const applicationCapabilityFactories = new WeakMap<
	object,
	ApplicationCapabilityFactory<unknown>
>()

/** Converts one provider protocol into the immutable facts accepted by JSON snapshots. */
type CapabilityDeclarationValue<TValue> = TValue extends JsonValue
	? TValue
	: TValue extends (...arguments_: never[]) => unknown
		? never
		: TValue extends readonly unknown[]
			? {
					readonly [TIndex in keyof TValue]: CapabilityDeclarationValue<
						TValue[TIndex]
					>
				}
			: TValue extends object
				? {
						readonly [TKey in keyof TValue]: CapabilityDeclarationValue<
							TValue[TKey]
						>
					}
				: never

type ProvideCapabilityOptions<TToken extends CapabilityToken> =
	TToken['lifetime'] extends 'declaration'
		? Readonly<{
				contributionId: string
				value: CapabilityDeclarationValue<CapabilityProviderValue<TToken>>
			}>
		: Readonly<{
				contributionId: string
				create: ApplicationCapabilityFactory<CapabilityProviderValue<TToken>>
			}>

const assertContributionId: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)
}

const assertExactOptions = (
	value: Readonly<Record<PropertyKey, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
}

/** Declares one exact provider while keeping application resources inert. */
export const provideCapability = <const TToken extends CapabilityToken>(
	token: TToken,
	options: ProvideCapabilityOptions<TToken>,
): CapabilityProviderDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability provider token')
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability provider options must be a plain object')
	}

	assertContributionId(options.contributionId, 'contributionId')

	if (token.lifetime === 'declaration') {
		assertExactOptions(
			untrustedOptions,
			new Set(['contributionId', 'value']),
			'capability provider options',
		)
	} else {
		assertExactOptions(
			untrustedOptions,
			new Set(['contributionId', 'create']),
			'capability provider options',
		)
		if (typeof untrustedOptions.create !== 'function') {
			throw new TypeError(
				'application capability provider create must be a function',
			)
		}
	}

	const provider = immutableRecord({
		kind: 'capability-provider' as const,
		token,
		contributionId: options.contributionId,
		...(token.lifetime === 'declaration'
			? {
					value: snapshotJsonValue(
						untrustedOptions.value,
						'capability provider value',
					),
				}
			: {}),
	})

	capabilityProviders.add(provider)
	if (token.lifetime === 'application') {
		applicationCapabilityFactories.set(
			provider,
			untrustedOptions.create as ApplicationCapabilityFactory<unknown>,
		)
	}
	return provider as CapabilityProviderDeclaration<TToken>
}

type DecoratableCapabilityToken = CapabilityToken<
	unknown,
	unknown,
	string,
	string,
	'single' | 'pipeline'
>

/** Declares one owner-bound wrapper around the complete consumer view. */
export interface CapabilityDecoratorDeclaration<
	TToken extends DecoratableCapabilityToken = DecoratableCapabilityToken,
> extends CapabilityContributionBase<TToken> {
	readonly kind: 'capability-decorator'
}

const capabilityDecorators = new WeakSet<object>()
const capabilityDecoratorFunctions = new WeakMap<
	object,
	(consumer: unknown) => unknown
>()

/** Declares a deterministic complete-view decorator for single or pipeline tokens. */
export const decorateCapability = <
	const TToken extends DecoratableCapabilityToken,
>(
	token: TToken,
	options: Readonly<{
		contributionId: string
		decorate: (
			consumer: CapabilityConsumerValue<TToken>,
		) => CapabilityConsumerValue<TToken>
	}>,
): CapabilityDecoratorDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability decorator token')
	if ((token as CapabilityToken).cardinality === 'multiple') {
		throw new TypeError('multiple capabilities cannot be decorated')
	}

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability decorator options must be a plain object')
	}
	assertExactOptions(
		untrustedOptions,
		new Set(['contributionId', 'decorate']),
		'capability decorator options',
	)
	assertContributionId(options.contributionId, 'contributionId')
	if (typeof options.decorate !== 'function') {
		throw new TypeError('capability decorator decorate must be a function')
	}

	const decorator = immutableRecord({
		kind: 'capability-decorator' as const,
		token,
		contributionId: options.contributionId,
	})
	capabilityDecorators.add(decorator)
	capabilityDecoratorFunctions.set(decorator, options.decorate)
	return decorator
}

/** Declares one privileged replacement with its own provider provenance. */
export type CapabilityReplacementDeclaration<
	TToken extends CapabilityToken = CapabilityToken,
> = CapabilityContributionBase<TToken> &
	Readonly<{
		kind: 'capability-replacement'
		target: CapabilityContributionTarget
	}> &
	(TToken['lifetime'] extends 'declaration'
		? Readonly<{ value: CapabilityProviderValue<TToken> }>
		: Readonly<Record<never, never>>)

const capabilityReplacements = new WeakSet<object>()

type ReplaceCapabilityOptions<TToken extends CapabilityToken> = Readonly<{
	contributionId: string
	target: CapabilityContributionTarget
}> &
	(TToken['lifetime'] extends 'declaration'
		? Readonly<{ value: CapabilityProviderValue<TToken> }>
		: Readonly<{
				create: ApplicationCapabilityFactory<CapabilityProviderValue<TToken>>
			}>)

const snapshotContributionTarget = (
	target: unknown,
): CapabilityContributionTarget => {
	if (!isPlainRecord(target)) {
		throw new TypeError('capability replacement target must be a plain object')
	}
	assertExactOptions(
		target,
		new Set(['contributionId', 'owner']),
		'capability replacement target',
	)
	assertContributionId(target.contributionId, 'target.contributionId')
	if (!isPlainRecord(target.owner)) {
		throw new TypeError(
			'capability replacement target.owner must be a plain object',
		)
	}
	assertExactOptions(
		target.owner,
		new Set(['instanceId', 'pluginId']),
		'capability replacement target.owner',
	)
	assertNonEmptyString(target.owner.pluginId, 'target.owner.pluginId')
	if (target.owner.instanceId !== undefined) {
		assertNonEmptyString(target.owner.instanceId, 'target.owner.instanceId')
	}

	return immutableRecord({
		owner: immutableRecord({
			pluginId: target.owner.pluginId,
			...(target.owner.instanceId === undefined
				? {}
				: { instanceId: target.owner.instanceId }),
		}),
		contributionId: target.contributionId,
	})
}

/** Declares an exact owner-targeted provider replacement. */
export const replaceCapability = <const TToken extends CapabilityToken>(
	token: TToken,
	options: ReplaceCapabilityOptions<TToken>,
): CapabilityReplacementDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability replacement token')
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability replacement options must be a plain object')
	}
	assertContributionId(options.contributionId, 'contributionId')
	const target = snapshotContributionTarget(options.target)

	if (token.lifetime === 'declaration') {
		assertExactOptions(
			untrustedOptions,
			new Set(['contributionId', 'target', 'value']),
			'capability replacement options',
		)
	} else {
		assertExactOptions(
			untrustedOptions,
			new Set(['contributionId', 'create', 'target']),
			'capability replacement options',
		)
		if (typeof untrustedOptions.create !== 'function') {
			throw new TypeError(
				'application capability replacement create must be a function',
			)
		}
	}

	const replacement = immutableRecord({
		kind: 'capability-replacement' as const,
		token,
		contributionId: options.contributionId,
		target,
		...(token.lifetime === 'declaration'
			? {
					value: snapshotJsonValue(
						untrustedOptions.value,
						'capability replacement value',
					),
				}
			: {}),
	})

	capabilityReplacements.add(replacement)
	if (token.lifetime === 'application') {
		applicationCapabilityFactories.set(
			replacement,
			untrustedOptions.create as ApplicationCapabilityFactory<unknown>,
		)
	}
	return replacement as CapabilityReplacementDeclaration<TToken>
}

/** Runs one hidden application provider or replacement factory. */
export const runApplicationCapabilityFactory = (
	declaration: CapabilityProviderDeclaration | CapabilityReplacementDeclaration,
	context: ApplicationCapabilityFactoryContext,
): MaybePromise<ApplicationCapabilityResource<unknown>> => {
	const factory = applicationCapabilityFactories.get(declaration)
	if (factory === undefined) {
		throw new TypeError('Capability declaration has no application factory')
	}

	return factory(context)
}

/** Applies one hidden decorator to an already composed consumer view. */
export const runCapabilityDecorator = <
	TToken extends DecoratableCapabilityToken,
>(
	declaration: CapabilityDecoratorDeclaration<TToken>,
	consumer: CapabilityConsumerValue<TToken>,
): CapabilityConsumerValue<TToken> => {
	const decorate = capabilityDecoratorFunctions.get(declaration)
	if (decorate === undefined) {
		throw new TypeError('Unknown capability decorator')
	}

	return decorate(consumer)
}

/** Declares one compatible capability use without reading a provider. */
export type CapabilityRequirementPhase = 'materialization' | 'setup'

export interface CapabilityRequirement<
	TToken extends CapabilityToken = CapabilityToken,
	TOptional extends boolean = boolean,
	TRange extends string = string,
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly kind: 'capability-requirement'
	readonly token: TToken
	readonly version: TRange
	readonly optional: TOptional
	/** Selects provider-first materialization or order-independent setup access. */
	readonly phase: TPhase
}

const capabilityRequirements = new WeakSet<object>()
const capabilityRequirementOptionKeys = new Set(['phase'])

/** Selects when an application capability requirement may be consumed. */
export interface CapabilityRequirementOptions<
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly phase: TPhase
}

const normalizeCapabilityRequirementPhase = (
	options: CapabilityRequirementOptions | undefined,
): CapabilityRequirementPhase => {
	if (options === undefined) return 'materialization'

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability requirement options must be a plain object')
	}
	assertExactOptions(
		untrustedOptions,
		capabilityRequirementOptionKeys,
		'capability requirement options',
	)
	if (
		untrustedOptions.phase !== 'materialization' &&
		untrustedOptions.phase !== 'setup'
	) {
		throw new TypeError(
			'capability requirement phase must be materialization or setup',
		)
	}

	return untrustedOptions.phase
}

const createCapabilityRequirement = <
	const TToken extends CapabilityToken,
	const TOptional extends boolean,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase,
>(
	token: TToken,
	version: TRange,
	optional: TOptional,
	phase: TPhase,
): CapabilityRequirement<TToken, TOptional, TRange, TPhase> => {
	assertCapabilityToken(token, 'capability requirement token')
	assertNonEmptyString(version, 'capability requirement version')
	if (validRange(version) === null) {
		throw new TypeError(
			'capability requirement version must be a valid semantic version range',
		)
	}

	if (!satisfies(token.version, version)) {
		throw new TypeError(
			`Capability token ${token.capabilityId}@${token.version} does not satisfy its declared range ${version}`,
		)
	}

	const requirement = immutableRecord({
		kind: 'capability-requirement' as const,
		token,
		version,
		optional,
		phase,
	})

	capabilityRequirements.add(requirement)
	return requirement
}

/** Declares a capability that must have a compatible provider. */
export const requireCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, false, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		false,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Declares a capability that may be absent but must never be probed implicitly. */
export const optionalCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, true, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		true,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Rejects forged provider declarations at manifest boundaries. */
export const assertCapabilityProviderDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityProviderDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityProviders.has(value)) {
		throw new TypeError(`${path} must be created by provideCapability`)
	}
}

/** Rejects forged decorator declarations at manifest boundaries. */
export const assertCapabilityDecoratorDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityDecoratorDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityDecorators.has(value)) {
		throw new TypeError(`${path} must be created by decorateCapability`)
	}
}

/** Rejects forged replacement declarations at manifest boundaries. */
export const assertCapabilityReplacementDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityReplacementDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityReplacements.has(value)) {
		throw new TypeError(`${path} must be created by replaceCapability`)
	}
}

/** Rejects forged requirements at manifest boundaries. */
export const assertCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement = (value, path) => {
	if (!isPlainRecord(value) || !capabilityRequirements.has(value)) {
		throw new TypeError(
			`${path} must be created by requireCapability or optionalCapability`,
		)
	}
}

/** Narrows privilege conditions to trusted optional requirements only. */
export const assertOptionalCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement<CapabilityToken, true> = (
	value,
	path,
) => {
	assertCapabilityRequirement(value, path)
	if (!value.optional) {
		throw new TypeError(`${path} must be an optional capability requirement`)
	}
}

/** Groups one plugin's inert capability declarations. */
export interface PluginCapabilityDeclarations<
	TProvides extends readonly CapabilityProviderDeclaration[] =
		readonly CapabilityProviderDeclaration[],
	TDecorates extends readonly CapabilityDecoratorDeclaration[] =
		readonly CapabilityDecoratorDeclaration[],
	TReplaces extends readonly CapabilityReplacementDeclaration[] =
		readonly CapabilityReplacementDeclaration[],
	TRequires extends readonly CapabilityRequirement<CapabilityToken, false>[] =
		readonly CapabilityRequirement<CapabilityToken, false>[],
	TOptional extends readonly CapabilityRequirement<CapabilityToken, true>[] =
		readonly CapabilityRequirement<CapabilityToken, true>[],
> {
	readonly provides: TProvides
	readonly decorates: TDecorates
	readonly replaces: TReplaces
	readonly requires: TRequires
	readonly optional: TOptional
}

/** Accepts omitted capability groups while preserving exact declaration tuples. */
export interface PluginCapabilityDeclarationOptions {
	readonly provides?: readonly CapabilityProviderDeclaration[]
	readonly decorates?: readonly CapabilityDecoratorDeclaration[]
	readonly replaces?: readonly CapabilityReplacementDeclaration[]
	readonly requires?: readonly CapabilityRequirement<CapabilityToken, false>[]
	readonly optional?: readonly CapabilityRequirement<CapabilityToken, true>[]
}

type NormalizedProviders<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['provides'] extends readonly CapabilityProviderDeclaration[]
			? readonly [...TOptions['provides']]
			: readonly []
		: readonly []

type NormalizedDecorators<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['decorates'] extends readonly CapabilityDecoratorDeclaration[]
			? readonly [...TOptions['decorates']]
			: readonly []
		: readonly []

type NormalizedReplacements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['replaces'] extends readonly CapabilityReplacementDeclaration[]
			? readonly [...TOptions['replaces']]
			: readonly []
		: readonly []

type NormalizedRequirements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['requires'] extends readonly CapabilityRequirement<
				CapabilityToken,
				false
			>[]
			? readonly [...TOptions['requires']]
			: readonly []
		: readonly []

type NormalizedOptionalRequirements<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['optional'] extends readonly CapabilityRequirement<
				CapabilityToken,
				true
			>[]
			? readonly [...TOptions['optional']]
			: readonly []
		: readonly []

/** Maps omitted declaration groups to exact immutable empty tuples. */
export type NormalizedPluginCapabilityDeclarations<TOptions> =
	PluginCapabilityDeclarations<
		NormalizedProviders<TOptions>,
		NormalizedDecorators<TOptions>,
		NormalizedReplacements<TOptions>,
		NormalizedRequirements<TOptions>,
		NormalizedOptionalRequirements<TOptions>
	>

const normalizeCapabilityArray = <TValue>(
	values: readonly TValue[] | undefined,
	path: string,
	assertValue: (value: unknown, path: string) => void,
): readonly TValue[] => {
	if (values === undefined) return immutableArray([])

	const untrustedValues: unknown = values
	if (!isUnknownArray(untrustedValues)) {
		throw new TypeError(`${path} must be an array`)
	}

	for (const [index, value] of untrustedValues.entries()) {
		assertValue(value, `${path}[${String(index)}]`)
	}

	return immutableArray(values)
}

const assertRequirementOptionality = (
	requirement: CapabilityRequirement,
	optional: boolean,
	path: string,
): void => {
	if (requirement.optional !== optional) {
		throw new TypeError(
			`${path} must be created by ${optional ? 'optionalCapability' : 'requireCapability'}`,
		)
	}
}

/** Snapshots capability arrays without selecting providers or materializing values. */
export const normalizeCapabilityDeclarations = (
	options: PluginCapabilityDeclarationOptions | undefined,
): PluginCapabilityDeclarations => {
	if (options === undefined) {
		return immutableRecord({
			provides: immutableArray([]),
			decorates: immutableArray([]),
			replaces: immutableArray([]),
			requires: immutableArray([]),
			optional: immutableArray([]),
		})
	}

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capabilities must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (
			key !== 'provides' &&
			key !== 'decorates' &&
			key !== 'replaces' &&
			key !== 'requires' &&
			key !== 'optional'
		) {
			throw new TypeError(`capabilities contains unknown option: ${key}`)
		}
	}

	const provides = normalizeCapabilityArray(
		options.provides,
		'capabilities.provides',
		assertCapabilityProviderDeclaration,
	)
	const decorates = normalizeCapabilityArray(
		options.decorates,
		'capabilities.decorates',
		assertCapabilityDecoratorDeclaration,
	)
	const replaces = normalizeCapabilityArray(
		options.replaces,
		'capabilities.replaces',
		assertCapabilityReplacementDeclaration,
	)
	const requires = normalizeCapabilityArray(
		options.requires,
		'capabilities.requires',
		assertCapabilityRequirement,
	)
	const optional = normalizeCapabilityArray(
		options.optional,
		'capabilities.optional',
		assertCapabilityRequirement,
	)

	for (const [index, requirement] of requires.entries()) {
		assertRequirementOptionality(
			requirement,
			false,
			`capabilities.requires[${String(index)}]`,
		)
	}

	for (const [index, requirement] of optional.entries()) {
		assertRequirementOptionality(
			requirement,
			true,
			`capabilities.optional[${String(index)}]`,
		)
	}

	return immutableRecord({
		provides,
		decorates,
		replaces,
		requires,
		optional,
	})
}
