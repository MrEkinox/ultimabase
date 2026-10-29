// An open live read over Server-Sent Events (D-154), ended with its client,
// its caller or the application. A live list whose client left is kept 10 s,
// what it sends held, so that the same user's request with its token takes
// it back, grown, even before the server saw it leave. A live list's first
// event is its token.
import { randomUUID } from 'node:crypto'
import { run } from '@ultimabase/http/internal'
import type {
	LiveHandle,
	LiveMessage,
	RealtimeApi,
	Viewer,
} from '@ultimabase/realtime'
import type { Logger } from 'ultimabase'
import type { Shape } from './fields.ts'
import { shaped } from './fields.ts'
import type { Events } from './sse.ts'
import { eventsTo } from './sse.ts'

/**
 * The realtime engine, what ends each open stream, the kept lists, and what
 * keeps each open list as if its client left, by token.
 */
export type Live = {
	readonly realtime: RealtimeApi
	readonly streams: Set<() => void>
	readonly kept: Map<string, Kept>
	readonly open: Map<string, () => void>
	readonly logger: Logger
}

/** Where a live read writes: an open stream of events, its response aside. */
export type Sink = Omit<Events, 'response'>

type Changed = Exclude<
	LiveMessage,
	{ readonly kind: 'closed' | 'row' | 'value' }
>
/** What a live list's messages write. */
export type Write = (message: Changed) => void

/** A live read to open, given the viewer and what takes its messages. */
export type Open = (
	viewer: Viewer,
	send: (message: LiveMessage) => void,
) => Promise<LiveHandle>

/** A live list: what writes it, what read it is, its rows, and its token. */
export type Listed = {
	readonly write: (sink: Sink) => Write
	readonly signature: string
	readonly first: number
	readonly resume: string | undefined
}

/** A sink that writes to its stream, or holds what it is sent while none. */
type Relay = Sink & {
	readonly to: (sink: Sink) => void
	/** Holds what it is sent from now on; `ended` runs if it ends. */
	readonly park: (ended: () => void) => void
}

type Stream = {
	readonly viewer: Viewer
	readonly relay: Relay
	readonly keep: Keep | undefined
	readonly signature: string
	handle?: LiveHandle
	/** Whether its client left before its first read. */
	ended: boolean
}

type Keep = { readonly token: string; first: number }

/** A list whose client left, until a resume takes it or its time is up. */
export type Kept = {
	readonly stream: Stream
	readonly handle: LiveHandle
	readonly keep: Keep
	/** Takes it out, still open. */
	readonly take: () => void
	readonly discard: () => void
}

/** How long a list whose client left waits for a resume. */
const keptFor = 10_000
const nothing = (): void => undefined

function relayOf(): Relay {
	let current: Sink | undefined
	let ended = nothing
	const held: (readonly [string, unknown, number | undefined])[] = []
	return {
		send: (event, data, id) => {
			if (current === undefined) held.push([event, data, id])
			else current.send(event, data, id)
		},
		full: () => current?.full() ?? false,
		drained: (then) => {
			if (current === undefined) then()
			else current.drained(then)
		},
		end: () => {
			if (current === undefined) ended()
			else current.end()
		},
		to: (sink) => {
			current = sink
			for (const [event, data, id] of held.splice(0)) sink.send(event, data, id)
		},
		park: (then) => {
			current = undefined
			ended = then
		},
	}
}

/**
 * Follows the read `open` starts into `sink`; a list's changes go through
 * `list`. Changes are dropped while the client's buffer is full, until the
 * engine sends the window again. A closing error is sent as it comes: its
 * read made it public.
 */
export async function follow(
	sink: Sink,
	viewer: Viewer,
	shape: Shape,
	open: Open,
	list?: (sink: Sink) => Write,
): Promise<LiveHandle> {
	const writes = list?.(sink)
	let handle: LiveHandle | undefined
	let dropping = false
	let owed = false
	const send = (message: LiveMessage) => {
		if (message.kind === 'closed') {
			if (message.error !== undefined) sink.send('error', message.error)
			// A viewer closes when its caller changed: the client reconnects.
			else if (!viewer.closed) {
				sink.send('error', {
					code: 'INTERNAL',
					message: 'The live read closed.',
				})
			}
			return sink.end()
		}
		if (dropping && message.kind === 'changes') return
		if (!dropping && sink.full()) {
			dropping = true
			sink.drained(() => {
				if (handle === undefined) owed = true
				else void handle.resend()
			})
			return
		}
		dropping = false
		if (message.kind === 'value') {
			return sink.send('data', message.value, message.revision)
		}
		if (message.kind !== 'row') return writes?.(message)
		const { row, revision } = message
		sink.send('data', row && shaped(row, shape), revision)
	}
	handle = await open(viewer, send)
	if (owed) void handle.resend()
	return handle
}

/** Keeps `stream`'s list once its client left, until a resume takes it. */
function park(live: Live, stream: Stream, handle: LiveHandle, keep: Keep) {
	const take = () => {
		clearTimeout(timer)
		live.kept.delete(keep.token)
		live.streams.delete(discard)
	}
	const discard = () => {
		take()
		handle.close()
		stream.viewer.close()
	}
	const timer = setTimeout(discard, keptFor)
	timer.unref()
	stream.relay.park(discard)
	live.streams.add(discard)
	live.kept.set(keep.token, { stream, handle, keep, take, discard })
}

/**
 * `request`'s stream of events, which `stream` writes to from now on; the
 * list is kept once the client leaves, unless the stream was ended.
 */
function eventsFor(
	live: Live,
	request: Request,
	stream: Stream,
): { readonly response: Response; readonly finish: () => void } {
	let over = false
	let left = false
	const leave = () => {
		if (left) return
		left = true
		live.streams.delete(finish)
		const { viewer, handle, keep } = stream
		if (keep !== undefined) live.open.delete(keep.token)
		if (over || handle === undefined || keep === undefined || viewer.closed) {
			stream.ended = true
			handle?.close()
			return viewer.close()
		}
		park(live, stream, handle, keep)
	}
	const events = eventsTo(request, leave)
	const finish = () => {
		over = true
		events.end()
	}
	live.streams.add(finish)
	if (stream.keep !== undefined) {
		// A resume may come before the server sees this client leave.
		live.open.set(stream.keep.token, () => {
			leave()
			events.end()
		})
		// First, before what a kept list held.
		events.send('resume', stream.keep.token)
	}
	stream.relay.to({ ...events, end: finish })
	return { response: events.response, finish }
}

/** The list `list.resume` keeps, as the same read of the same user, grown. */
async function resumed(
	live: Live,
	request: Request,
	list: Listed,
): Promise<Response | undefined> {
	const token = list.resume ?? ''
	live.open.get(token)?.()
	const kept = live.kept.get(token)
	if (kept === undefined) return undefined
	const { stream, handle, keep } = kept
	if (stream.signature !== list.signature || list.first < keep.first) {
		return undefined
	}
	// Out first, so that neither its time nor another request takes it.
	kept.take()
	// The kept read follows this request's caller; another user ends it.
	if (!(await stream.viewer.adopt(request))) {
		kept.discard()
		return undefined
	}
	const { response, finish } = eventsFor(live, request, stream)
	try {
		if (list.first > keep.first) {
			await run(async () => handle.grow(list.first - keep.first))
		}
	} catch (error) {
		finish()
		stream.viewer.close()
		throw error
	}
	keep.first = list.first
	return response
}

/**
 * `request`'s stream of the read `open` starts, closed with the client; a
 * list resumes the one its token keeps when it may.
 */
export async function streamed(
	live: Live,
	request: Request,
	shape: Shape,
	open: Open,
	list?: Listed,
): Promise<Response> {
	if (list?.resume !== undefined) {
		const taken = await resumed(live, request, list)
		if (taken !== undefined) return taken
	}
	const viewer = await live.realtime.connect(request)
	const stream: Stream = {
		viewer,
		relay: relayOf(),
		keep: list && { token: randomUUID(), first: list.first },
		signature: list?.signature ?? '',
		ended: false,
	}
	const { response, finish } = eventsFor(live, request, stream)
	try {
		stream.handle = await run(async () =>
			follow(stream.relay, viewer, shape, open, list?.write),
		)
	} catch (error) {
		finish()
		viewer.close()
		throw error
	}
	if (stream.ended) stream.handle.close()
	return response
}
