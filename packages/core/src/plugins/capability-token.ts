import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { valid } from 'semver'

import { pluginPrivilegeMetadata, type PluginPrivilege } from './manifest.js'

/** Determines how compatible provider declarations compose in one application. */
export type CapabilityCardinality = 'single' | 'multiple' | 'pipeline'

/** Determines when a capability value may exist. */
export type CapabilityLifetime = 'declaration' | 'application'

declare const capabilityTokenBrand: unique symbol
declare const capabilityProviderType: unique symbol
declare const capabilityConsumerType: unique symbol

/** Identifies one independently versioned plugin protocol. */
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
	/** Requires every provider owner to declare this active privilege. */
	readonly providerPrivilege?: PluginPrivilege
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
	/** Requires every provider owner before static or application materialization. */
	readonly providerPrivilege?: PluginPrivilege
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
	'providerPrivilege',
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

		if (
			options.providerPrivilege !== undefined &&
			!Object.hasOwn(pluginPrivilegeMetadata, options.providerPrivilege)
		) {
			throw new TypeError(
				'capability providerPrivilege must be a known privilege',
			)
		}

		const token = immutableRecord({
			kind: 'capability-token' as const,
			capabilityId: options.capabilityId,
			version: options.version,
			cardinality: options.cardinality,
			lifetime: options.lifetime,
			...(options.providerPrivilege === undefined
				? {}
				: { providerPrivilege: options.providerPrivilege }),
		})

		capabilityTokens.add(token)
		capabilityComposers.set(
			token,
			options.compose as (providers: readonly unknown[]) => unknown,
		)

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
