import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { satisfies, valid, validRange } from 'semver'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

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

/** Configures one static, independently versioned protocol identity. */
export interface DefineCapabilityOptions<
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
}

/** Creates exact token metadata after the protocol selects its value types. */
export type DefineCapabilityFactory<TProvider, TConsumer = TProvider> = <
	const TCapabilityId extends string,
	const TVersion extends string,
	const TCardinality extends CapabilityCardinality,
	const TLifetime extends CapabilityLifetime,
>(
	options: DefineCapabilityOptions<
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
const defineCapabilityOptionKeys = new Set([
	'capabilityId',
	'version',
	'cardinality',
	'lifetime',
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

		const token = immutableRecord({
			kind: 'capability-token' as const,
			capabilityId: options.capabilityId,
			version: options.version,
			cardinality: options.cardinality,
			lifetime: options.lifetime,
		})

		capabilityTokens.add(token)

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

/** Rejects structurally forged tokens at plugin declaration boundaries. */
export const assertCapabilityToken: (
	value: unknown,
	path: string,
) => asserts value is CapabilityToken = (value, path) => {
	if (!isPlainRecord(value) || !capabilityTokens.has(value)) {
		throw new TypeError(`${path} must be created by defineCapability`)
	}
}

/** Declares one static provider without selecting or composing it. */
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
					token: TToken
					value: TProvider
				}>
			: Readonly<{
					kind: 'capability-provider'
					token: TToken
				}>
		: never

const capabilityProviders = new WeakSet<object>()

/** Declares one exact provider while keeping application resources inert. */
export const provideCapability = <const TToken extends CapabilityToken>(
	token: TToken,
	...values: TToken['lifetime'] extends 'declaration'
		? readonly [value: CapabilityProviderValue<TToken>]
		: readonly []
): CapabilityProviderDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability provider token')

	if (token.lifetime === 'declaration' && values.length !== 1) {
		throw new TypeError('declaration capability providers require a value')
	}

	if (token.lifetime === 'application' && values.length !== 0) {
		throw new TypeError(
			'application capability providers must not declare a value before materialization',
		)
	}

	const provider = immutableRecord({
		kind: 'capability-provider' as const,
		token,
		...(token.lifetime === 'declaration'
			? { value: snapshotJsonValue(values[0], 'capability provider value') }
			: {}),
	})

	capabilityProviders.add(provider)
	return provider as CapabilityProviderDeclaration<TToken>
}

/** Declares one compatible capability use without reading a provider. */
export interface CapabilityRequirement<
	TToken extends CapabilityToken = CapabilityToken,
	TOptional extends boolean = boolean,
	TRange extends string = string,
> {
	readonly kind: 'capability-requirement'
	readonly token: TToken
	readonly version: TRange
	readonly optional: TOptional
}

const capabilityRequirements = new WeakSet<object>()

const createCapabilityRequirement = <
	const TToken extends CapabilityToken,
	const TOptional extends boolean,
	const TRange extends string,
>(
	token: TToken,
	version: TRange,
	optional: TOptional,
): CapabilityRequirement<TToken, TOptional, TRange> => {
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
	})

	capabilityRequirements.add(requirement)
	return requirement
}

/** Declares a capability that must have a compatible provider. */
export const requireCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
>(
	token: TToken,
	version: TRange,
): CapabilityRequirement<TToken, false, TRange> =>
	createCapabilityRequirement(token, version, false)

/** Declares a capability that may be absent but must never be probed implicitly. */
export const optionalCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
>(
	token: TToken,
	version: TRange,
): CapabilityRequirement<TToken, true, TRange> =>
	createCapabilityRequirement(token, version, true)

/** Rejects forged provider declarations at manifest boundaries. */
export const assertCapabilityProviderDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityProviderDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityProviders.has(value)) {
		throw new TypeError(`${path} must be created by provideCapability`)
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
	TRequires extends readonly CapabilityRequirement<CapabilityToken, false>[] =
		readonly CapabilityRequirement<CapabilityToken, false>[],
	TOptional extends readonly CapabilityRequirement<CapabilityToken, true>[] =
		readonly CapabilityRequirement<CapabilityToken, true>[],
> {
	readonly provides: TProvides
	readonly requires: TRequires
	readonly optional: TOptional
}

/** Accepts omitted capability groups while preserving exact declaration tuples. */
export interface PluginCapabilityDeclarationOptions {
	readonly provides?: readonly CapabilityProviderDeclaration[]
	readonly requires?: readonly CapabilityRequirement<CapabilityToken, false>[]
	readonly optional?: readonly CapabilityRequirement<CapabilityToken, true>[]
}

type NormalizedProviders<TOptions> =
	TOptions extends PluginCapabilityDeclarationOptions
		? TOptions['provides'] extends readonly CapabilityProviderDeclaration[]
			? readonly [...TOptions['provides']]
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
			requires: immutableArray([]),
			optional: immutableArray([]),
		})
	}

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capabilities must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (key !== 'provides' && key !== 'requires' && key !== 'optional') {
			throw new TypeError(`capabilities contains unknown option: ${key}`)
		}
	}

	const provides = normalizeCapabilityArray(
		options.provides,
		'capabilities.provides',
		assertCapabilityProviderDeclaration,
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
		requires,
		optional,
	})
}
