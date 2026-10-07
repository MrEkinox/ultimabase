import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { assertExactObjectKeys } from '../exact-object-validation.js'

import {
	snapshotJsonValue,
	type JsonValue,
} from '../schema/fields/builtins/json.js'
import type { CompiledSchemaRegistry } from '../schema/index.js'
import type { ApplicationCallbackExecutor } from './callback-execution.js'
import type {
	CapabilityRequirement,
	CapabilityRequirementPhase,
} from './capabilities.js'
import {
	assertCapabilityToken,
	type CapabilityCardinality,
	type CapabilityConsumerValue,
	type CapabilityProviderValue,
	type CapabilityToken,
} from './capability-token.js'
import type { DatabaseConstraintCompilerReader } from './constraint-compilers.js'
import type { PluginIdentity, PluginPrivilege } from './manifest.js'

/** Owns one application provider value and its optional deterministic cleanup. */
export interface ApplicationCapabilityResource<TProvider> {
	readonly value: TProvider
	readonly dispose?: () => MaybePromise<void>
}

/** Reads only capability requirements declared by the current plugin owner. */
export interface PluginCapabilityReader<
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	contributions<
		TToken extends CapabilityToken<
			unknown,
			unknown,
			string,
			string,
			CapabilityCardinality,
			'application'
		>,
		TRange extends string,
	>(
		requirement: CapabilityRequirement<TToken, boolean, TRange, TPhase>,
	): readonly CapabilityProviderContribution<TToken>[]
	get<TToken extends CapabilityToken, TRange extends string>(
		requirement: CapabilityRequirement<TToken, false, TRange, TPhase>,
	): CapabilityConsumerValue<TToken>
	get<TToken extends CapabilityToken, TRange extends string>(
		requirement: CapabilityRequirement<TToken, true, TRange, TPhase>,
	): CapabilityConsumerValue<TToken> | undefined
}

/** Retains one materialized provider's exact application-local ownership. */
export interface CapabilityProviderContribution<
	TToken extends CapabilityToken = CapabilityToken,
> {
	readonly contributionId: string
	readonly owner: PluginIdentity
	readonly pluginVersion: string
	readonly value: CapabilityProviderValue<TToken>
}

/** Supplies an application provider with owner-bound declared capability reads. */
export interface ApplicationCapabilityFactoryContext {
	readonly owner: PluginIdentity
	readonly callbacks: ApplicationCallbackExecutor
	readonly assertPrivilege: (privilege: PluginPrivilege) => void
	readonly capabilities: PluginCapabilityReader<'materialization'>
	readonly constraintCompilers: DatabaseConstraintCompilerReader
	readonly schemas: CompiledSchemaRegistry
}

/** Creates one application-local provider without exposing it in static metadata. */
export type ApplicationCapabilityFactory<TProvider> = (
	context: ApplicationCapabilityFactoryContext,
) => MaybePromise<ApplicationCapabilityResource<TProvider>>

export interface CapabilityContributionBase<TToken extends CapabilityToken> {
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
			? Readonly<{ kind: 'capability-provider' }> &
					CapabilityContributionBase<TToken> &
					Readonly<{ value: TProvider }>
			: Readonly<{ kind: 'capability-provider' }> &
					CapabilityContributionBase<TToken>
		: never

const capabilityProviders = new WeakSet<object>()
const applicationCapabilityFactories = new WeakMap<
	object,
	ApplicationCapabilityFactory<unknown>
>()

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
				/** Distinguishes repeated providers for the same token from one owner. */
				contributionId?: string
				value: CapabilityDeclarationValue<CapabilityProviderValue<TToken>>
			}>
		: Readonly<{
				/** Distinguishes repeated providers for the same token from one owner. */
				contributionId?: string
				create: ApplicationCapabilityFactory<CapabilityProviderValue<TToken>>
			}>

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

	if (options.contributionId !== undefined) {
		assertNonEmptyString(options.contributionId, 'contributionId')
	}

	const factoryKey = token.lifetime === 'declaration' ? 'value' : 'create'
	assertExactObjectKeys(
		untrustedOptions,
		new Set(['contributionId', factoryKey]),
		'capability provider options contains unknown option: ',
	)
	if (
		token.lifetime !== 'declaration' &&
		typeof untrustedOptions.create !== 'function'
	) {
		throw new TypeError(
			'application capability provider create must be a function',
		)
	}

	const provider = immutableRecord({
		kind: 'capability-provider' as const,
		token,
		contributionId: options.contributionId ?? token.capabilityId,
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

/** Runs one hidden application provider factory. */
export const runApplicationCapabilityFactory = (
	declaration: CapabilityProviderDeclaration,
	context: ApplicationCapabilityFactoryContext,
): MaybePromise<ApplicationCapabilityResource<unknown>> => {
	const factory = applicationCapabilityFactories.get(declaration)
	if (factory === undefined) {
		throw new TypeError('Capability declaration has no application factory')
	}

	return factory(context)
}

/** Rejects forged provider declarations at manifest boundaries. */
export const assertCapabilityProviderDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityProviderDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityProviders.has(value)) {
		throw new TypeError(`${path} must be created by provideCapability`)
	}
}

/** @internal Describes one Core-owned provider installed only when a plugin consumes it. */
export type CoreFoundationProvider<TToken extends CapabilityToken> = Readonly<{
	declaration: CapabilityProviderDeclaration<TToken>
	owner: PluginIdentity
	version: string
}>

/** @internal Attributes one canonical provider declaration to Core itself. */
export const defineCoreFoundationProvider = <TToken extends CapabilityToken>(
	declaration: CapabilityProviderDeclaration<TToken>,
): CoreFoundationProvider<TToken> =>
	immutableRecord({
		declaration,
		owner: immutableRecord({ pluginId: '@ultimabase/core' }),
		version: '0.0.0',
	})
