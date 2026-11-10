// The kernel's tracing channels read into Sentry (D-361): each message a
// span, the active span of the work it runs, and each error the server
// logs an issue.
import { AsyncLocalStorage } from 'node:async_hooks'
import type {
	TracingChannel,
	TracingChannelSubscribers,
} from 'node:diagnostics_channel'
import { channel, tracingChannel } from 'node:diagnostics_channel'
import {
	getAsyncContextStrategy,
	getMainCarrier,
	SPAN_STATUS_ERROR,
} from '@sentry/core'
import type { Span } from '@sentry/node'
import {
	captureException,
	startInactiveSpan,
	withActiveSpan,
} from '@sentry/node'
import type {
	FunctionMessage,
	HookMessage,
	Identity,
	OperationMessage,
	VirtualMessage,
} from 'ultimabase'

type Attributes = { readonly [name: string]: string | number }

/** A span's name and attributes, read from its message. */
type Described = { readonly name: string; readonly attributes: Attributes }

const callerOf = (caller: Identity): string =>
	caller.kind === 'user' ? `user:${caller.user.id}` : caller.kind

/**
 * The store Sentry keeps its scopes in, which a tracing channel binds to
 * make a span active (D-361); undefined when this `@sentry/core` is not the
 * one `Sentry.init` ran with.
 */
export function sentryStore(): AsyncLocalStorage<unknown> | undefined {
	const binding =
		getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()
	const store: unknown = binding?.asyncLocalStorage
	return store instanceof AsyncLocalStorage ? store : undefined
}

/** A failed span's `error.type`: the error's public code, or its name. */
function typeOf(error: unknown): string {
	if (typeof error !== 'object' || error === null) return 'unknown'
	const code: unknown = 'code' in error ? error.code : undefined
	if (typeof code === 'string') return code
	return error instanceof Error ? error.name : 'unknown'
}

type Messages = {
	readonly operation: OperationMessage
	readonly hook: HookMessage
	readonly virtual: VirtualMessage
	readonly function: FunctionMessage
}

/** Makes a span of each message of `ultimabase:<kind>`; returns its undo. */
function follow<K extends keyof Messages>(
	kind: K,
	describe: (message: Messages[K]) => Described,
	store: AsyncLocalStorage<unknown> | undefined,
): () => void {
	type M = Messages[K]
	const on: TracingChannel<unknown, M> = tracingChannel(`ultimabase:${kind}`)
	const spans = new WeakMap<object, Span>()
	const spanOf = (message: M): Span => {
		const known = spans.get(message)
		if (known !== undefined) return known
		const { name, attributes } = describe(message)
		const span = startInactiveSpan({
			name,
			op: `ultimabase.${kind}`,
			onlyIfParent: true,
			attributes,
		})
		spans.set(message, span)
		return span
	}
	const end = (message: M): void => {
		spans.get(message)?.end()
		spans.delete(message)
	}
	const subscribers: TracingChannelSubscribers<M> = {
		start: (message) => {
			spanOf(message)
		},
		// Each traced work is async: it rejects, and ends at `asyncEnd`.
		end: () => undefined,
		asyncStart: () => undefined,
		asyncEnd: end,
		error: (message) => {
			const type = typeOf(message.error)
			spans
				.get(message)
				?.setStatus({ code: SPAN_STATUS_ERROR, message: type })
				.setAttribute('error.type', type)
		},
	}
	on.subscribe(subscribers)
	if (store !== undefined) {
		on.start.bindStore(store, (message) =>
			withActiveSpan(spanOf(message), () => store.getStore()),
		)
	}
	return () => {
		on.unsubscribe(subscribers)
		if (store !== undefined) on.start.unbindStore(store)
	}
}

const plugin = (name: string | undefined): string =>
	name === undefined ? '' : ` (${name})`

/** Each channel followed; returns their undo. */
export function followAll(
	store: AsyncLocalStorage<unknown> | undefined,
): readonly (() => void)[] {
	return [
		follow(
			'operation',
			(message) => ({
				name: `${message.model}.${message.operation}`,
				attributes: {
					'ultimabase.model': message.model,
					'ultimabase.operation': message.operation,
					'ultimabase.caller': callerOf(message.caller),
				},
			}),
			store,
		),
		follow(
			'hook',
			(message) => ({
				name: `${message.model}.${message.hook}${plugin(message.plugin)}`,
				attributes: {
					'ultimabase.model': message.model,
					'ultimabase.hook': message.hook,
					...(message.plugin === undefined
						? {}
						: { 'ultimabase.plugin': message.plugin }),
				},
			}),
			store,
		),
		follow(
			'virtual',
			(message) => ({
				name: `${message.model}.${message.field}`,
				attributes: {
					'ultimabase.model': message.model,
					'ultimabase.field': message.field,
					'ultimabase.rows': message.rows,
				},
			}),
			store,
		),
		follow(
			'function',
			(message) => ({
				name: message.name,
				attributes: {
					'ultimabase.function': message.name,
					'ultimabase.caller': callerOf(message.caller),
				},
			}),
			store,
		),
		reportErrors(),
	]
}

/** An issue of one message of `ultimabase:error`. */
function report(published: unknown): void {
	if (typeof published !== 'object' || published === null) return
	if (!('error' in published)) return
	if (!('correlationId' in published) || !('message' in published)) return
	const { error, correlationId, message } = published
	if (typeof correlationId !== 'string' || typeof message !== 'string') return
	captureException(error, { tags: { correlationId }, extra: { message } })
}

/** Each message of `ultimabase:error` an issue; returns its undo. */
function reportErrors(): () => void {
	const errors = channel('ultimabase:error')
	errors.subscribe(report)
	return () => errors.unsubscribe(report)
}
