import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { JsonDocument } from '../../schema/index.js'
import type {
	HookContext,
	HookContextIdentity,
} from '../../schema/hooks/hook-context.js'

/** Carries one detached portable business event after its transaction commits. */
export interface HookEvent<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	/** Identifies the event contract selected by its producer and consumers. */
	readonly name: TName
	/** Contains the deeply immutable JSON document captured during emission. */
	readonly payload: TPayload
	/** Correlates delivery with the request that emitted the event. */
	readonly requestId: string
	/** Correlates delivery with the successfully committed transaction. */
	readonly transactionId: string
	/** Identifies the hook declaration that emitted the event. */
	readonly emittedBy: HookContextIdentity
}

/** Supplies one post-commit event and a capability-restricted hook context. */
export interface HookEventHandlerInput<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly context: HookContext
	readonly event: HookEvent<TName, TPayload>
}

/** Handles one named event after the transaction has committed successfully. */
export type HookEventHandler<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> = (input: HookEventHandlerInput<TName, TPayload>) => MaybePromise<void>

/** Configures one plugin-owned consumer for an exact event name. */
export interface OnEventOptions<
	TName extends string,
	TPayload extends JsonDocument = JsonDocument,
> {
	/** Selects the exact emitted event name consumed by this handler. */
	readonly name: TName
	/** Runs after commit in deterministic plugin contribution order. */
	readonly handler: HookEventHandler<TName, TPayload>
}

declare const hookEventDefinitionType: unique symbol

/** Retains event-name and payload inference without exposing the callback. */
export interface HookEventDefinition<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
> {
	readonly kind: 'hook-event'
	readonly name: TName
	readonly [hookEventDefinitionType]?: HookEventHandler<TName, TPayload>
}

/** @internal Retains one validated callback behind its opaque public definition. */
export interface HookEventImplementation {
	readonly handler: (input: never) => MaybePromise<void>
	readonly name: string
}

const hookEventImplementations = new WeakMap<object, HookEventImplementation>()
const onEventOptionKeys = new Set(['handler', 'name'])

/** Creates one immutable named-event consumer for a plugin events registry. */
export const onEvent = <
	const TName extends string,
	TPayload extends JsonDocument = JsonDocument,
>(
	options: OnEventOptions<TName, TPayload>,
): HookEventDefinition<TName, TPayload> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('onEvent options must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (!onEventOptionKeys.has(key)) {
			throw new TypeError(`onEvent contains unknown option: ${key}`)
		}
	}

	assertNonEmptyString(options.name, 'onEvent name')

	if (typeof options.handler !== 'function') {
		throw new TypeError('onEvent handler must be a function')
	}

	const definition: HookEventDefinition<TName, TPayload> = immutableRecord({
		kind: 'hook-event' as const,
		name: options.name,
	})

	hookEventImplementations.set(
		definition,
		immutableRecord({
			handler: options.handler,
			name: options.name,
		}),
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
