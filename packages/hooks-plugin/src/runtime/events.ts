import {
	assertNonEmptyString,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { JsonDocument } from '@ultimabase/core'
import {
	defineCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '@ultimabase/core/plugin'
import type {
	HookContext,
	HookContextIdentity,
	HookEventContract,
} from '../context/hook-context.js'

// Only contracts made by `defineEvent` are trusted; they are frozen.
const hookEventContracts = new WeakSet<object>()

/**
 * Defines one typed event; emitters and consumers bind to this value, not to
 * its name (ADR-0318).
 *
 * @example `export const todoCreated = defineEvent<{ todoId: string }>('todo.created')`
 */
export const defineEvent = <TPayload extends JsonDocument = JsonDocument>(
	name: string,
): HookEventContract<TPayload> => {
	assertNonEmptyString(name, 'event name')
	const contract: HookEventContract<TPayload> = immutableRecord({
		kind: 'hook-event-contract' as const,
		name,
	})
	hookEventContracts.add(contract)
	return contract
}

/** Tells whether a value is a contract created by `defineEvent`. */
export const isHookEventContract = (
	value: unknown,
): value is HookEventContract =>
	typeof value === 'object' && value !== null && hookEventContracts.has(value)

/** One event delivered after the transaction that emitted it committed. */
export interface HookEvent<TPayload extends JsonDocument = JsonDocument> {
	/** The name given to `defineEvent`. */
	readonly name: string
	/** The frozen JSON payload captured when the event was emitted. */
	readonly payload: TPayload
	/** The request that emitted the event, for correlation in logs. */
	readonly requestId: string
	/** The committed transaction that emitted the event. */
	readonly transactionId: string
	/** The hook declaration that emitted the event. */
	readonly emittedBy: HookContextIdentity
}

/** What an event consumer receives. */
export interface HookEventHandlerInput<
	TPayload extends JsonDocument = JsonDocument,
> {
	/** The originating request's identity, outside its transaction. */
	readonly context: HookContext
	readonly event: HookEvent<TPayload>
}

/**
 * Handles one event after commit, outside the transaction: it may use the
 * normal API, which starts its own request; a failure is logged.
 */
export type HookEventHandler<TPayload extends JsonDocument = JsonDocument> = (
	input: HookEventHandlerInput<TPayload>,
) => MaybePromise<void>

declare const hookEventDefinitionType: unique symbol

/** One consumer bound to an event contract, created by `onEvent`. */
export interface HookEventDefinition<
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly kind: 'hook-event'
	/** The consumed event's name. */
	readonly name: string
	readonly [hookEventDefinitionType]?: TPayload
}

/** @internal Retains one validated consumer behind its opaque public definition. */
export interface HookEventImplementation {
	readonly contract: HookEventContract
	readonly handler: (input: never) => MaybePromise<void>
}

const hookEventImplementations = new WeakMap<object, HookEventImplementation>()

/**
 * Binds one consumer to an event contract. Consumers run after commit, in
 * declaration order, best effort within the process (ADR-0318).
 *
 * @example `hooksPlugin({ events: [onEvent(todoCreated, ({ event }) => notify(event.payload.todoId))] })`
 */
export const onEvent = <TPayload extends JsonDocument>(
	contract: HookEventContract<TPayload>,
	handler: HookEventHandler<TPayload>,
): HookEventDefinition<TPayload> => {
	if (!isHookEventContract(contract)) {
		throw new TypeError('onEvent requires an event created by defineEvent')
	}
	if (typeof handler !== 'function') {
		throw new TypeError('onEvent handler must be a function')
	}
	const definition: HookEventDefinition<TPayload> = immutableRecord({
		kind: 'hook-event' as const,
		name: contract.name,
	})
	hookEventImplementations.set(
		definition,
		immutableRecord({ contract, handler }),
	)
	return definition
}

/** Reads only definitions created by the trusted factory in this module. */
export const getHookEventImplementation = (
	definition: unknown,
): HookEventImplementation | undefined =>
	typeof definition === 'object' && definition !== null
		? hookEventImplementations.get(definition)
		: undefined

export type HookEventContributionsCapability = CapabilityToken<
	HookEventDefinition,
	readonly HookEventDefinition[],
	'ultimabase.hooks.event-consumers',
	'1.0.0',
	'multiple',
	'application'
>

/** Composes official Hook event consumers in plugin graph order. */
export const hookEventContributionsCapability: HookEventContributionsCapability =
	defineCapability<HookEventDefinition, readonly HookEventDefinition[]>()({
		capabilityId: 'ultimabase.hooks.event-consumers',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'runtime:observe',
		compose: (providers) => Object.freeze([...providers]),
	})

/** Provides one plugin-owned event consumer without a Core-owned registry. */
export const provideHookEvent = (
	contributionId: string,
	definition: HookEventDefinition,
): CapabilityProviderDeclaration<typeof hookEventContributionsCapability> =>
	provideCapability(hookEventContributionsCapability, {
		contributionId,
		create: () => immutableRecord({ value: definition }),
	})
