// A live read as graphql-ws streams it (D-154): the engine's messages in
// order, each run against the subscription's selection, and those a full socket
// cannot take dropped until the window is sent again.
// A completed live list is kept 10 s for a resume, its later events waiting.
import type {
	ASTNode,
	DocumentNode,
	ExecutionResult,
	OperationDefinitionNode,
} from 'graphql'
import { Kind, visit } from 'graphql'
import { Backlog } from '@ultimabase/http/internal'
import type { LiveHandle, LiveMessage, Viewer } from '@ultimabase/realtime'
import type { Pieces } from './pieces.ts'

/**
 * What to send of `result`, which lets go of its data: graphql-ws and
 * graphql-js keep the last result until the next, which a quiet list may never
 * have (D-253).
 */
export function released<Result extends { data?: unknown }>(
	result: Result,
): Result {
	const sent = { ...result }
	const kept: { data?: unknown } = result
	kept.data = null
	return sent
}

/** A message to run against the selection, and how its result is sent. */
export class LiveEvent {
	root: unknown
	/** Whether its root is rows, which `SharedResults` may run for others. */
	readonly shared: boolean
	/** A big window's parts, which run a turn of the loop each (D-272). */
	pieces: Pieces | undefined
	#finish: (result: ExecutionResult) => ExecutionResult

	constructor(
		root: unknown,
		finish: (result: ExecutionResult) => ExecutionResult,
		shared = true,
		pieces?: Pieces,
	) {
		this.root = root
		this.shared = shared
		this.pieces = pieces
		this.#finish = finish
	}

	/**
	 * What to send for its `result`. Lets go of its rows: graphql-js keeps the
	 * last event until the next one, which a quiet list may never have (D-253).
	 */
	finish(result: ExecutionResult): ExecutionResult {
		const finish = this.#finish
		this.root = undefined
		this.pieces = undefined
		this.#finish = (done) => done
		return finish(result)
	}
}

/**
 * The values of what an event's execution reads: the arguments of the root
 * field chose its rows, and subscriptions differing only there run alike (D-267).
 */
export function variablesBelowRoot(
	document: DocumentNode,
	operation: OperationDefinitionNode,
	values: { readonly [name: string]: unknown } | null | undefined,
): readonly unknown[] {
	const names = new Set<string>()
	const read = (node: ASTNode) => {
		visit(node, {
			Variable: (variable) => {
				names.add(variable.name.value)
			},
		})
	}
	for (const selection of operation.selectionSet.selections) {
		if (selection.kind === Kind.FIELD) {
			selection.directives?.forEach(read)
			if (selection.selectionSet !== undefined) read(selection.selectionSet)
		} else {
			read(selection)
		}
	}
	for (const definition of document.definitions) {
		if (definition.kind === Kind.FRAGMENT_DEFINITION) read(definition)
	}
	return [...names].toSorted().map((name) => [name, values?.[name]])
}

/**
 * The results of the events subscriptions run alike: what a generated type
 * shows of a row depends on that row and on the selection, so subscribers of
 * one row share one execution (D-265). Forgotten as the loop turns: a result
 * stays no longer than it takes to send.
 */
export class SharedResults {
	readonly #results = new Map<string, Map<string, Promise<ExecutionResult>>>()

	async run(
		shape: string,
		root: unknown,
		execute: () => ExecutionResult | Promise<ExecutionResult>,
	): Promise<ExecutionResult> {
		const results = this.#results
		if (results.size === 0) setImmediate(() => results.clear())
		let alike = results.get(shape)
		if (alike === undefined) {
			alike = new Map()
			results.set(shape, alike)
		}
		const key = JSON.stringify(root) ?? ''
		let result = alike.get(key)
		if (result === undefined) {
			result = Promise.resolve(execute())
			alike.set(key, result)
		}
		return result
	}
}

/** The socket a connection's subscriptions write to. */
export type Channel = {
	readonly viewer: Viewer
	/** Whether the client's buffer holds more than it may. */
	readonly full: () => boolean
	/** Runs `then` once everything sent is written. */
	readonly drained: (then: () => void) => void
	/** Closes the socket: its viewer ended, and says why (D-278). */
	readonly shut: () => void
	/** The completed live lists a resume may take back, by token. */
	readonly kept: Map<string, Kept>
}

/**
 * A subscription's channel, whether it gets the whole window each time, and
 * the token of the completed list it resumes.
 */
export type Live = {
	readonly channel: Channel
	readonly page: boolean
	readonly resume?: string
}

/** A live list's token, what read it is, and the rows it shows. */
export type Keep = {
	readonly token: string
	readonly signature: string
	first: number
}

/** A completed live list, until a resume takes it or its time is up. */
export type Kept = {
	readonly keep: Keep
	readonly stream: AsyncIterableIterator<LiveEvent>
	readonly handle: LiveHandle
	readonly timer: NodeJS.Timeout
	readonly end: () => void
}

/** How long a completed live list waits for a resume. */
const keptFor = 10_000

/** Each WebSocket operation's, by its context. */
export const lives: WeakMap<object, Live> = new WeakMap()

const finished = (): IteratorResult<LiveEvent> => ({
	done: true,
	value: undefined,
})

/** Keeps a completed live list 10 s for a resume, then ends it. */
function keepFor(channel: Channel, list: Omit<Kept, 'timer'>): void {
	const timer = setTimeout(() => {
		channel.kept.delete(list.keep.token)
		list.end()
	}, keptFor)
	timer.unref()
	channel.kept.set(list.keep.token, { ...list, timer })
}

/**
 * The list `token` keeps, taken back when it is the same read and grown to
 * `first` rows; a growth refused past a limit keeps it as it was (D-186).
 */
export async function resumed(
	channel: Channel,
	token: string,
	signature: string,
	first: number,
): Promise<AsyncIterableIterator<LiveEvent> | undefined> {
	const kept = channel.kept.get(token)
	if (kept?.keep.signature !== signature || first < kept.keep.first) {
		return undefined
	}
	channel.kept.delete(token)
	clearTimeout(kept.timer)
	try {
		if (first > kept.keep.first) await kept.handle.grow(first - kept.keep.first)
	} catch (error) {
		keepFor(channel, kept)
		throw error
	}
	kept.keep.first = first
	return kept.stream
}

/**
 * Follows the read `open` starts; `event` turns each message the client
 * gets into what it runs, and `closed`, given a live function's error, into
 * the last one, unless the viewer ended, which closes the socket. A list given `keep` is kept once completed.
 */
export async function liveStream(
	channel: Channel,
	open: (send: (message: LiveMessage) => void) => Promise<LiveHandle>,
	event: (message: Exclude<LiveMessage, { kind: 'closed' }>) => LiveEvent,
	closed: (error?: unknown) => LiveEvent,
	keep?: Keep,
): Promise<AsyncIterableIterator<LiveEvent>> {
	const queue: LiveEvent[] = []
	let waiting: ((next: IteratorResult<LiveEvent>) => void) | undefined
	let ending = false
	let done = false
	// Past what a full buffer takes, messages drop until the window comes whole.
	const backlog = new Backlog()
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
				return channel.shut()
			}
			ending = true
			return push(closed(message.error))
		}
		// Past that, every message is dropped until the client drains: one resend
		// then brings it the current state.
		if (dropping) return
		if (!backlog.takes(channel.full(), message)) {
			queue.length = 0
			dropping = true
			channel.drained(() => {
				dropping = false
				if (handle === undefined) owed = true
				else void handle.resend()
			})
			return
		}
		push(event(message))
	}
	const opened = await open(send)
	handle = opened
	if (owed) void opened.resend()
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
			if (channel.kept.get(keep?.token ?? '')?.stream === stream) {
				return finished()
			}
			if (keep === undefined || done || ending || channel.viewer.closed) {
				end()
				return finished()
			}
			const taker = waiting
			waiting = undefined
			taker?.(finished())
			keepFor(channel, { keep, stream, handle: opened, end })
			return finished()
		},
		[Symbol.asyncIterator]: () => stream,
	}
	return stream
}
