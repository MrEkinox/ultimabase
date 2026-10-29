// A live read as graphql-ws streams it (D-154): the engine's messages in
// order, each run against the subscription's selection, and those the client
// cannot take while its socket is full dropped until the window is sent again.
import type { ExecutionResult } from 'graphql'
import type { LiveHandle, LiveMessage, Viewer } from '@ultimabase/realtime'

/** A message to run against the selection, and how its result is sent. */
export class LiveEvent {
	readonly root: unknown
	readonly finish: (result: ExecutionResult) => ExecutionResult

	constructor(
		root: unknown,
		finish: (result: ExecutionResult) => ExecutionResult,
	) {
		this.root = root
		this.finish = finish
	}
}

/** The socket a connection's subscriptions write to. */
export type Channel = {
	readonly viewer: Viewer
	/** Whether the client's buffer holds more than it may. */
	readonly full: () => boolean
	/** Runs `then` once everything sent is written. */
	readonly drained: (then: () => void) => void
	/** Closes the socket: its caller is no longer the same user. */
	readonly forbid: () => void
}

/** A subscription's channel and whether it gets the whole window each time. */
export type Live = { readonly channel: Channel; readonly page: boolean }

/** Each WebSocket operation's, by its context. */
export const lives: WeakMap<object, Live> = new WeakMap()

const finished = (): IteratorResult<LiveEvent> => ({
	done: true,
	value: undefined,
})

/**
 * Follows the read `open` starts; `event` turns each message the client
 * gets into what it runs, and `closed` into the last one, unless the viewer
 * ended, which closes the socket.
 */
export async function liveStream(
	channel: Channel,
	open: (send: (message: LiveMessage) => void) => Promise<LiveHandle>,
	event: (message: Exclude<LiveMessage, { kind: 'closed' }>) => LiveEvent,
	closed: () => LiveEvent,
): Promise<AsyncIterableIterator<LiveEvent>> {
	const queue: LiveEvent[] = []
	let waiting: ((next: IteratorResult<LiveEvent>) => void) | undefined
	let ending = false
	let done = false
	// Changes are dropped from a full buffer until the window comes whole.
	let dropping = false
	let owed = false
	let handle: LiveHandle | undefined
	const push = (value: LiveEvent) => {
		const taker = waiting
		waiting = undefined
		if (taker === undefined) queue.push(value)
		else taker({ done: false, value })
	}
	const end = () => {
		done = true
		queue.length = 0
		handle?.close()
		const taker = waiting
		waiting = undefined
		taker?.(finished())
	}
	const send = (message: LiveMessage) => {
		if (done || ending) return
		if (message.kind === 'closed') {
			if (channel.viewer.closed) {
				end()
				return channel.forbid()
			}
			ending = true
			return push(closed())
		}
		if (dropping && message.kind === 'changes') return
		if (!dropping && channel.full()) {
			queue.length = 0
			dropping = true
			channel.drained(() => {
				if (handle === undefined) owed = true
				else void handle.resend()
			})
			return
		}
		dropping = false
		push(event(message))
	}
	handle = await open(send)
	if (owed) void handle.resend()
	const stream: AsyncIterableIterator<LiveEvent> = {
		next: async () => {
			const value = queue.shift()
			if (value !== undefined) return { done: false, value }
			if (done || ending) {
				end()
				return finished()
			}
			return new Promise((taker) => {
				waiting = taker
			})
		},
		return: async () => {
			end()
			return finished()
		},
		[Symbol.asyncIterator]: () => stream,
	}
	return stream
}
