import {
	FrameworkError,
	defineCapability,
	deferCurrentTransactionEffect,
	getCurrentTransactionId,
	jsonField,
	optionalCapability,
	provideCapability,
	snapshotScalarFieldValue,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CapabilityToken,
	type JsonDocument,
	type PluginCapabilityReader,
	type PluginIdentity,
	type PluginPrivilege,
	type RequestContext,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

/** Selects whether emitting without a registered observer is valid. */
export type PluginEventDelivery = 'optional' | 'required'

declare const pluginEventContractType: unique symbol

/** Names one portable JSON event without installing a producer or observer. */
export interface PluginEventContract<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
	TDelivery extends PluginEventDelivery = PluginEventDelivery,
> {
	readonly delivery: TDelivery
	readonly name: TName
	readonly [pluginEventContractType]?: Readonly<{ payload: TPayload }>
}

// Only contracts created here are trusted; they are frozen, so their name and
// delivery can be read back directly.
const eventContracts = new WeakSet<object>()
const eventPayloadField = jsonField()

/** Defines one trusted event name and its zero-observer behavior. */
export const definePluginEvent =
	<TPayload extends JsonDocument = JsonDocument>() =>
	<const TName extends string, const TDelivery extends PluginEventDelivery>(
		name: TName,
		options: Readonly<{ delivery: TDelivery }>,
	): PluginEventContract<TName, TPayload, TDelivery> => {
		assertNonEmptyString(name, 'plugin event name')
		if (!isPlainRecord(options)) {
			throw new TypeError('plugin event options must be a plain object')
		}
		for (const key of Object.keys(options)) {
			if (key !== 'delivery') {
				throw new TypeError(`plugin event contains unknown option: ${key}`)
			}
		}
		if (options.delivery !== 'optional' && options.delivery !== 'required') {
			throw new TypeError('plugin event delivery must be optional or required')
		}

		const contract: PluginEventContract<TName, TPayload, TDelivery> =
			immutableRecord({ delivery: options.delivery, name })
		eventContracts.add(contract)
		return contract
	}

/** Carries one detached event after the transaction that emitted it commits. */
export interface PluginEvent<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly emittedBy: PluginIdentity
	readonly name: TName
	readonly payload: TPayload
	readonly requestId: string
	readonly transactionId: string
}

/** Supplies committed event data and the immutable originating request. */
export interface PluginEventHandlerInput<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly context: RequestContext
	readonly event: PluginEvent<TName, TPayload>
}

/** Handles one exact event after successful transaction commit. */
export type PluginEventHandler<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> = (input: PluginEventHandlerInput<TName, TPayload>) => MaybePromise<void>

declare const pluginEventObserverType: unique symbol

/** Retains event inference while keeping executable observers outside metadata. */
export interface PluginEventObserver<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly kind: 'plugin-event-observer'
	readonly name: TName
	readonly [pluginEventObserverType]?: Readonly<{
		name: TName
		payload: TPayload
	}>
}

interface PluginEventObserverImplementation {
	readonly handler: PluginEventHandler
	readonly name: string
}

const eventObservers = new WeakMap<object, PluginEventObserverImplementation>()

/** Creates one inert typed observer later provided through an event capability. */
export const observePluginEvent = <
	const TName extends string,
	TPayload extends JsonDocument,
>(
	contract: PluginEventContract<TName, TPayload>,
	handler: PluginEventHandler<TName, TPayload>,
): PluginEventObserver<TName, TPayload> => {
	if (!eventContracts.has(contract)) {
		throw new TypeError('Invalid plugin event contract')
	}
	if (typeof handler !== 'function') {
		throw new TypeError('plugin event handler must be a function')
	}

	const observer: PluginEventObserver<TName, TPayload> = immutableRecord({
		kind: 'plugin-event-observer' as const,
		name: contract.name,
	})
	eventObservers.set(
		observer,
		immutableRecord({
			handler: handler as PluginEventHandler,
			name: contract.name,
		}),
	)
	return observer
}

/** Represents one versioned application-local channel for independent observers. */
export type PluginEventCapability<
	TCapabilityId extends string = string,
	TVersion extends string = string,
> = CapabilityToken<
	PluginEventObserver,
	readonly PluginEventObserver[],
	TCapabilityId,
	TVersion,
	'multiple',
	'application'
>

/** Creates one versioned application-local channel for independent observers. */
export const definePluginEventCapability = <
	const TCapabilityId extends string,
	const TVersion extends string,
>(
	options: Readonly<{ capabilityId: TCapabilityId; version: TVersion }>,
): PluginEventCapability<TCapabilityId, TVersion> =>
	defineCapability<PluginEventObserver, readonly PluginEventObserver[]>()({
		...options,
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'runtime:observe',
		compose: (providers) => immutableArray(providers),
	})
/** Provides one observer while retaining Core ownership and privilege checks. */
export const providePluginEvent = <const TToken extends PluginEventCapability>(
	token: TToken,
	contributionId: string,
	observer: PluginEventObserver,
): CapabilityProviderDeclaration<TToken> => {
	if (!eventObservers.has(observer)) {
		throw new TypeError('Invalid plugin event observer')
	}

	const declaration = provideCapability(token as PluginEventCapability, {
		contributionId,
		create: () => ({ value: observer }),
	})
	return declaration as CapabilityProviderDeclaration<TToken>
}

/** Queues typed events and dispatches them in capability contribution order. */
export interface PluginEventDispatcher {
	emit<
		const TName extends string,
		TPayload extends JsonDocument,
		TDelivery extends PluginEventDelivery,
	>(
		context: RequestContext,
		contract: PluginEventContract<TName, TPayload, TDelivery>,
		payload: TPayload,
	): void
}

/** Materializes one producer-local dispatcher from its declared optional channel. */
export const createPluginEventDispatcher = <
	const TToken extends PluginEventCapability,
>(options: {
	readonly assertPrivilege: (privilege: PluginPrivilege) => void
	readonly capabilities: PluginCapabilityReader<'materialization'>
	readonly owner: PluginIdentity
	readonly requirement: CapabilityRequirement<
		TToken,
		true,
		string,
		'materialization'
	>
}): PluginEventDispatcher => {
	const observers = options.capabilities
		.contributions(options.requirement)
		.map(({ value }) => {
			const implementation = eventObservers.get(value)
			if (implementation === undefined) {
				throw new TypeError(
					'Plugin event capability contains an invalid observer',
				)
			}
			return implementation
		})

	const dispatcher: PluginEventDispatcher = {
		emit: (context, contract, payload) => {
			options.assertPrivilege('event:publish')
			if (!eventContracts.has(contract)) {
				throw new TypeError('Invalid plugin event contract')
			}
			const handlers = observers.filter(
				(observer) => observer.name === contract.name,
			)
			if (handlers.length === 0) {
				if (contract.delivery === 'optional') return
				throw new FrameworkError(
					'SERVICE_NOT_FOUND',
					`No plugin event observer is registered for "${contract.name}".`,
				)
			}

			const transactionId = getCurrentTransactionId()
			if (transactionId === undefined) {
				throw new FrameworkError(
					'TRANSACTION_ERROR',
					'Plugin events require an active transaction.',
				)
			}
			const event: PluginEvent = immutableRecord({
				emittedBy: options.owner,
				name: contract.name,
				payload: snapshotScalarFieldValue(
					eventPayloadField,
					payload,
					'plugin event payload',
				),
				requestId: context.requestId,
				transactionId,
			})

			deferCurrentTransactionEffect(async () => {
				const failures: unknown[] = []
				for (const observer of handlers) {
					try {
						await observer.handler(immutableRecord({ context, event }))
					} catch (error: unknown) {
						failures.push(error)
					}
				}
				if (failures.length === 1) throw failures[0]
				if (failures.length > 1) {
					throw new AggregateError(
						failures,
						`Plugin event "${contract.name}" observers failed.`,
					)
				}
			})
		},
	}
	return immutableRecord(dispatcher)
}

/** Creates the exact optional requirement paired with one event channel. */
export const optionalPluginEvents = <
	const TToken extends PluginEventCapability,
	const TVersion extends string,
>(
	token: TToken,
	version: TVersion,
): CapabilityRequirement<TToken, true, TVersion, 'materialization'> =>
	optionalCapability(token, version)
