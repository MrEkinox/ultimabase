// The work the kernel publishes on Node's tracing channels (D-360): a tool
// that subscribes sees each operation, hook, virtual and function, nested,
// and each error the server logs; without one, nothing is built.
import { randomUUID } from 'node:crypto'
import type { TracingChannel } from 'node:diagnostics_channel'
import { channel, tracingChannel } from 'node:diagnostics_channel'
import type { Logger } from './app-options.ts'
import type { Operation } from './engine.ts'
import type { Identity } from './rules.ts'

/** One model operation, on `ultimabase:operation`, as `Post.findMany`. */
export type OperationMessage = {
	readonly model: string
	readonly operation: Exclude<Operation, 'upserted'>
	/** The caller the operation was sent as, `{ as }`. */
	readonly caller: Identity
}

/** One hook's run, on `ultimabase:hook`. */
export type HookMessage = {
	readonly model: string
	readonly hook: string
	/** The plugin that declares it, `undefined` for the application's. */
	readonly plugin: string | undefined
}

/**
 * One virtual field on the rows of one read, on `ultimabase:virtual`: its
 * `run` for each row or its `runMany` once.
 */
export type VirtualMessage = {
	readonly model: string
	readonly field: string
	/** How many rows it computes. */
	readonly rows: number
}

/** One call of a `defineFunction`, on `ultimabase:function`. */
export type FunctionMessage = {
	readonly name: string
	readonly caller: Identity
}

/**
 * An error line with an `err`, on `ultimabase:error`: the kernel's, for an
 * error masked for a client or swallowed, the application's or a plugin's.
 */
export type ErrorMessage = {
	readonly error: unknown
	/** The id the log line has, and the client's error when it got one. */
	readonly correlationId: string
	/** The log line's message. */
	readonly message: string
}

// `tracePromise` adds `result` or `error` to the message it is given.
type Traced<M> = { -readonly [K in keyof M]: M[K] }

type Channel<M> = TracingChannel<unknown, Traced<M>>

export const operations: Channel<OperationMessage> = tracingChannel(
	'ultimabase:operation',
)
export const hooks: Channel<HookMessage> = tracingChannel('ultimabase:hook')
export const virtuals: Channel<VirtualMessage> =
	tracingChannel('ultimabase:virtual')
export const functions: Channel<FunctionMessage> = tracingChannel(
	'ultimabase:function',
)
const errors = channel('ultimabase:error')

/**
 * Runs `work`, published on `on` with its `message` when a tool subscribes
 * to it.
 */
export function traced<M extends object, T>(
	on: TracingChannel<unknown, M>,
	message: () => M,
	work: () => Promise<T>,
): Promise<T> {
	if (!on.hasSubscribers) return work()
	return on.tracePromise(work, message())
}

const reporters = new WeakSet<Logger>()

/** The line's own correlation id, or a new one. */
const idOf = (bindings: object): string =>
	'correlationId' in bindings && typeof bindings.correlationId === 'string'
		? bindings.correlationId
		: randomUUID()

/**
 * `logger`, whose error lines with an `err` get a correlation id and are
 * published on `ultimabase:error`, and so are its children's (D-381).
 */
export function reporting(logger: Logger): Logger {
	if (reporters.has(logger)) return logger
	// The line keeps its arguments: a message is passed only when given.
	const error = (first: object | string, ...rest: [string?]): void => {
		const [message] = rest
		if (typeof first === 'string') logger.error(first)
		else if (!('err' in first)) logger.error(first, ...rest)
		else {
			const correlationId = idOf(first)
			logger.error({ ...first, correlationId }, ...rest)
			if (errors.hasSubscribers) {
				const published: ErrorMessage = {
					error: first.err,
					correlationId,
					message: message ?? '',
				}
				errors.publish(published)
			}
		}
	}
	const reported: Logger = {
		info: logger.info.bind(logger),
		warn: logger.warn.bind(logger),
		error,
		child: (bindings) => reporting(logger.child(bindings)),
	}
	reporters.add(reported)
	return reported
}

/**
 * Logs `error` at error level with a new correlation id, which it returns,
 * and publishes it on `ultimabase:error` (D-360, D-381).
 */
export function logFailure(
	logger: Logger,
	error: unknown,
	message: string,
	facts: object = {},
): string {
	const correlationId = randomUUID()
	reporting(logger).error({ ...facts, correlationId, err: error }, message)
	return correlationId
}
