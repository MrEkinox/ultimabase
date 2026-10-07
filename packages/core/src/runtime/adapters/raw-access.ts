import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import { assertExactPlainObject } from '../../exact-object-validation.js'
import { FrameworkError } from '../../errors/framework-error.js'
import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactoryContext,
	type CapabilityProviderValue,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CapabilityToken,
	type PluginCapabilityReader,
} from '../../plugins/capabilities.js'
import type { PluginPrivilege } from '../../plugins/manifest.js'
import type { DatabaseTransactionAdapter } from '../database/contracts.js'
import {
	registerRawAdapterCapability,
	registerRawAdapterProvider,
} from './capabilities.js'

declare const rawAdapterFacadeType: unique symbol

/** Identifies one adapter-owned facade whose concrete methods remain package-specific. */
export interface AdapterRawCapabilityValue<TFacade extends object> {
	readonly kind: 'adapter-raw-capability-value'
	readonly [rawAdapterFacadeType]?: TFacade
}

/** Retains exact facade inference for one adapter-specific raw capability. */
export type AdapterRawCapabilityToken<
	TFacade extends object = object,
	TCapabilityId extends string = string,
	TVersion extends string = string,
> = CapabilityToken<
	AdapterRawCapabilityValue<TFacade>,
	AdapterRawCapabilityValue<TFacade>,
	TCapabilityId,
	TVersion,
	'single',
	'application'
>

/** Reads the adapter-owned facade type carried by one nominal raw token. */
export type AdapterRawFacade<TToken extends CapabilityToken> =
	CapabilityProviderValue<TToken> extends AdapterRawCapabilityValue<
		infer TFacade
	>
		? TFacade
		: never

/** Configures one nominal raw adapter protocol without defining its methods in Core. */
export interface DefineAdapterRawCapabilityOptions<
	TCapabilityId extends string,
	TVersion extends string,
> {
	readonly capabilityId: TCapabilityId
	readonly version: TVersion
}

/** Creates one adapter-specific raw capability guarded by Core-owned leases. */
export const defineAdapterRawCapability =
	<TFacade extends object>() =>
	<const TCapabilityId extends string, const TVersion extends string>(
		options: DefineAdapterRawCapabilityOptions<TCapabilityId, TVersion>,
	): AdapterRawCapabilityToken<TFacade, TCapabilityId, TVersion> => {
		const token = defineCapability<AdapterRawCapabilityValue<TFacade>>()({
			capabilityId: options.capabilityId,
			version: options.version,
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		registerRawAdapterCapability(token)
		return token
	}

/** Supplies an adapter facade for one setup or transaction lease. */
export interface AdapterRawProvider<TFacade extends object> {
	readonly setup?: () => MaybePromise<TFacade>
	readonly transaction?: (
		adapter: DatabaseTransactionAdapter,
	) => MaybePromise<TFacade>
}

/** Materializes one adapter-specific provider without exposing its callbacks. */
export interface ProvideAdapterRawCapabilityOptions<TFacade extends object> {
	readonly contributionId: string
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<AdapterRawProvider<TFacade>>
}

// Only values minted by the lease-aware factory resolve to a provider.
const rawAdapterProviders = new WeakMap<object, AdapterRawProvider<object>>()

const assertProvider: (
	value: unknown,
) => asserts value is AdapterRawProvider<object> = (value) => {
	assertExactPlainObject(
		value,
		new Set(['setup', 'transaction']),
		'raw adapter provider must be a plain object',
		'raw adapter provider contains unknown option: ',
	)
	if (value.setup !== undefined && typeof value.setup !== 'function') {
		throw new TypeError('raw adapter provider setup must be a function')
	}
	if (
		value.transaction !== undefined &&
		typeof value.transaction !== 'function'
	) {
		throw new TypeError('raw adapter provider transaction must be a function')
	}
	if (value.setup === undefined && value.transaction === undefined) {
		throw new TypeError('raw adapter provider must implement one lease scope')
	}
}

/** Declares one raw provider through the lease-aware factory. */
export const provideAdapterRawCapability = <
	const TToken extends AdapterRawCapabilityToken,
>(
	token: TToken,
	options: ProvideAdapterRawCapabilityOptions<AdapterRawFacade<TToken>>,
): CapabilityProviderDeclaration<TToken> => {
	const declaration = provideCapability(token as AdapterRawCapabilityToken, {
		contributionId: options.contributionId,
		create: async (context) => {
			const provider: unknown = await options.create(context)
			assertProvider(provider)
			const value: AdapterRawCapabilityValue<AdapterRawFacade<TToken>> =
				immutableRecord({
					kind: 'adapter-raw-capability-value' as const,
				})
			rawAdapterProviders.set(value, provider)
			return { value }
		},
	})
	registerRawAdapterProvider(declaration)
	return declaration as unknown as CapabilityProviderDeclaration<TToken>
}

const createExpiredLeaseError = (): FrameworkError<'TRANSACTION_ERROR'> =>
	new FrameworkError(
		'TRANSACTION_ERROR',
		'Raw adapter facade cannot be used after its lease has completed.',
		{
			publicMessage: 'The adapter lease is no longer active.',
			internalDetails: { reason: 'raw-adapter-lease-closed' },
		},
	)

const rejectMutation = (): never => {
	throw new TypeError('raw adapter facade is immutable')
}

const createRevocableFacade = (facade: object) => {
	let active = true
	const methods = new Map<PropertyKey, (...arguments_: unknown[]) => unknown>()
	const proxyTarget: object = {}
	const assertActive = (): void => {
		if (!active) throw createExpiredLeaseError()
	}
	const proxy = new Proxy(proxyTarget, {
		defineProperty: rejectMutation,
		deleteProperty: rejectMutation,
		get(_target, property) {
			assertActive()
			const value: unknown = Reflect.get(facade, property, facade)
			if (typeof value !== 'function') return value
			let method = methods.get(property)
			if (method === undefined) {
				method = (...arguments_: unknown[]): unknown => {
					assertActive()
					return Reflect.apply(value, facade, arguments_)
				}
				methods.set(property, method)
			}
			return method
		},
		getOwnPropertyDescriptor(_target, property) {
			assertActive()
			const descriptor = Reflect.getOwnPropertyDescriptor(facade, property)
			return descriptor === undefined
				? undefined
				: { ...descriptor, configurable: true }
		},
		getPrototypeOf() {
			assertActive()
			return Reflect.getPrototypeOf(facade)
		},
		has(_target, property) {
			assertActive()
			return Reflect.has(facade, property)
		},
		isExtensible() {
			assertActive()
			return true
		},
		ownKeys() {
			assertActive()
			return Reflect.ownKeys(facade)
		},
		preventExtensions: rejectMutation,
		set: rejectMutation,
		setPrototypeOf: rejectMutation,
	})

	return immutableRecord({
		facade: proxy,
		revoke: (): void => {
			active = false
			methods.clear()
		},
	})
}

type RawLeaseScope =
	| Readonly<{ readonly kind: 'setup' }>
	| Readonly<{
			readonly adapter: DatabaseTransactionAdapter
			readonly kind: 'transaction'
	  }>

const withRawLease = async <TResult>(
	value: AdapterRawCapabilityValue<object>,
	scope: RawLeaseScope,
	handler: (facade: object) => MaybePromise<TResult>,
): Promise<TResult> => {
	const provider = rawAdapterProviders.get(value)
	if (provider === undefined) {
		throw new TypeError('raw adapter capability value is not installed')
	}
	if (
		(scope.kind === 'setup' ? provider.setup : provider.transaction) ===
		undefined
	) {
		throw new FrameworkError(
			'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			`Raw adapter capability does not support ${scope.kind} leases.`,
			{
				publicMessage: 'The requested adapter capability is not available.',
				internalDetails: { scope: scope.kind },
			},
		)
	}
	const rawFacade: unknown = await (scope.kind === 'setup'
		? provider.setup?.()
		: provider.transaction?.(scope.adapter))
	if (typeof rawFacade !== 'object' || rawFacade === null) {
		throw new TypeError('raw adapter provider must return an object facade')
	}
	const lease = createRevocableFacade(rawFacade)
	try {
		return await handler(lease.facade)
	} finally {
		lease.revoke()
	}
}

/** Executes adapter-specific work without letting the raw facade escape its lease. */
export interface AdapterAccess {
	withRaw<
		const TRequirement extends CapabilityRequirement<
			AdapterRawCapabilityToken,
			false
		>,
		TResult,
	>(
		requirement: TRequirement,
		handler: (
			facade: AdapterRawFacade<NoInfer<TRequirement>['token']>,
		) => MaybePromise<TResult>,
	): Promise<TResult>
}

interface CreateAdapterAccessOptions {
	readonly assertPrivilege: (privilege: PluginPrivilege) => void
	readonly capabilities: PluginCapabilityReader
	readonly isOpen: () => boolean
	readonly scope: () => RawLeaseScope
}

/** @internal Creates one owner-bound lease facade for setup or Runtime. */
export const createAdapterAccess = (
	options: CreateAdapterAccessOptions,
): AdapterAccess =>
	immutableRecord({
		withRaw: async <
			const TRequirement extends CapabilityRequirement<
				AdapterRawCapabilityToken,
				false
			>,
			TResult,
		>(
			requirement: TRequirement,
			handler: (
				facade: AdapterRawFacade<NoInfer<TRequirement>['token']>,
			) => MaybePromise<TResult>,
		): Promise<TResult> => {
			if (!options.isOpen()) {
				throw new TypeError('adapter access facade is closed')
			}
			if (typeof handler !== 'function') {
				throw new TypeError('raw adapter lease handler must be a function')
			}
			options.assertPrivilege('adapter:raw')
			const value = options.capabilities.get(requirement)
			return withRawLease(value, options.scope(), (facade) =>
				handler(facade as AdapterRawFacade<NoInfer<TRequirement>['token']>),
			)
		},
	})
