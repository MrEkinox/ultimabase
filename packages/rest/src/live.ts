// A live model's list and row over Server-Sent Events (D-154): the read's
// JSON as `event: data`, then what changed as `event: live`, the JSON GraphQL
// sends under `extensions.live`; in page mode, `event: data` each time.
import { applied, badInput, connection, run } from '@ultimabase/http/internal'
import type {
	LiveHandle,
	LiveMessage,
	RealtimeApi,
	Viewer,
} from '@ultimabase/realtime'
import type { Caller, Row } from 'ultimabase'
import type { Api, Args, Entry } from './entries.ts'
import type { Shape } from './fields.ts'
import { readerOf, shaped } from './fields.ts'
import { bounded } from './limits.ts'
import { paramsOf } from './params.ts'
import type { Events } from './sse.ts'
import { eventsTo } from './sse.ts'

/** The realtime engine, and what ends each open stream. */
export type Live = {
	readonly realtime: RealtimeApi
	readonly streams: Set<() => void>
}

type Changed = Exclude<LiveMessage, { readonly kind: 'closed' | 'row' }>
type Write = (message: Changed) => void

/** Whether `request` asks for a stream of events. */
export const wantsEvents = (request: Request): boolean =>
	(request.headers.get('accept') ?? '').includes('text/event-stream')

/** The engine, unless `entry`'s model is not live. */
function liveOf(live: Live | undefined, entry: Entry): Live {
	const { name } = entry.model
	if (live !== undefined && live.realtime.live(name)) return live
	throw badInput(`${name} is not live: list realtime() in its use.`)
}

const fromTop = { size: undefined, backward: false }
const paging = new Set(['take', 'skip', 'cursor'])

/** What a live list's messages write, with what it sent so far. */
function listWriter(
	events: Sink,
	connected: boolean,
	page: boolean,
	counted: boolean,
	shape: Shape,
): Write {
	const node = (row: Row) => shaped(row, shape)
	let window: readonly Row[] = []
	let hasMore = false
	let count: number | undefined
	let pageInfo = ''
	const infoOf = () => {
		const { pageInfo: info } = connection(window, fromTop, () => null)
		return { ...info, hasNextPage: hasMore }
	}
	const data = (revision: number) => {
		const info = infoOf()
		pageInfo = JSON.stringify(info)
		const { edges } = connection(window, fromTop, node)
		const body = connected
			? { edges, pageInfo: info, ...(counted && { totalCount: count }) }
			: window.map(node)
		events.send('data', body, revision)
	}
	return (message) => {
		const { revision } = message
		hasMore = message.hasMore ?? hasMore
		count = message.totalCount ?? count
		if (message.kind === 'reset' || page) {
			window =
				message.kind === 'reset'
					? message.rows
					: applied(window, message.changes, (row) => row)
			return data(revision)
		}
		const { changes } = message
		window = applied(window, changes, ({ id }) => ({ id }))
		const live: { [key: string]: unknown } = {
			revision,
			changes: changes.map((change) => {
				if ('remove' in change) return change
				const [edge] = connection([change.upsert], fromTop, node).edges
				return {
					upsert: connected ? edge : node(change.upsert),
					after: change.after,
				}
			}),
		}
		if (counted && message.totalCount !== undefined) {
			live['totalCount'] = message.totalCount
		}
		const info = infoOf()
		if (connected && JSON.stringify(info) !== pageInfo) {
			pageInfo = JSON.stringify(info)
			live['pageInfo'] = info
		}
		events.send('live', live, revision)
	}
}

/** Where a live read writes: an open stream of events, its response aside. */
export type Sink = Omit<Events, 'response'>

/** A live read to open, given the viewer and what takes its messages. */
export type Open = (
	viewer: Viewer,
	send: (message: LiveMessage) => void,
) => Promise<LiveHandle>

/**
 * Follows the read `open` starts into `sink`; a list's changes go through
 * `list`. Changes are dropped while the client's buffer is full, until the
 * engine sends the window again.
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
			// A viewer closes when its caller changed: the client reconnects.
			if (!viewer.closed) {
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
		if (message.kind !== 'row') return writes?.(message)
		const { row, revision } = message
		sink.send('data', row && shaped(row, shape), revision)
	}
	handle = await open(viewer, send)
	if (owed) void handle.resend()
	return handle
}

/** `request`'s stream of the read `open` starts, closed with the client. */
async function streamed(
	live: Live,
	request: Request,
	shape: Shape,
	open: Open,
	list?: (sink: Sink) => Write,
): Promise<Response> {
	const viewer = await live.realtime.connect(request)
	let handle: LiveHandle | undefined
	let ended = false
	const events = eventsTo(request, () => {
		ended = true
		live.streams.delete(events.end)
		handle?.close()
		viewer.close()
	})
	live.streams.add(events.end)
	try {
		handle = await run(async () => follow(events, viewer, shape, open, list))
	} catch (error) {
		events.end()
		viewer.close()
		throw error
	}
	if (ended) handle.close()
	return events.response
}

/** `GET /api/posts` with `Accept: text/event-stream`: a live window. */
export async function liveList(
	api: Api,
	live: Live | undefined,
	entry: Entry,
	caller: Caller,
	request: Request,
): Promise<Response> {
	const followed = liveOf(live, entry)
	const connected = api.pagination === 'connection'
	const arg = connected ? 'first' : 'take'
	const params = paramsOf(request.url, {
		json: [
			'where',
			'orderBy',
			'select',
			'include',
			arg,
			...(connected ? ['totalCount'] : []),
		],
		text: ['mode'],
	})
	const { totalCount, mode, ...args } = params
	if (totalCount !== undefined && typeof totalCount !== 'boolean') {
		throw badInput('totalCount must be true or false.')
	}
	if (mode !== undefined && mode !== 'page') {
		throw badInput('mode must be page.')
	}
	const { name } = entry.model
	const read = await run(async () =>
		readerOf(api, caller.kind === 'master').list(entry, args, ''),
	)
	const asked = args[arg]
	const rows = typeof asked === 'number' ? asked : entry.take
	const page = mode === 'page'
	if (page && rows > entry.maxTake) {
		throw badInput(
			`${arg} is at most ${entry.maxTake} on ${name} in page mode.`,
		)
	}
	// A live list is bounded by maxLive, not by maxRows (D-154).
	bounded(api, caller, read.shape)
	// The window starts at the top of its order and holds `first` rows.
	const listed: Args = {
		...Object.fromEntries(
			Object.entries(read.read).filter(([key]) => !paging.has(key)),
		),
		first: rows,
		totalCount: totalCount === true,
	}
	return streamed(
		followed,
		request,
		read.shape,
		async (viewer, send) => viewer.list(name, listed, send),
		(events) =>
			listWriter(events, connected, page, totalCount === true, read.shape),
	)
}

/** `GET /api/posts/:id` with `Accept: text/event-stream`: a live row. */
export async function liveRow(
	api: Api,
	live: Live | undefined,
	entry: Entry,
	caller: Caller,
	request: Request,
	id: string,
): Promise<Response> {
	const followed = liveOf(live, entry)
	const params = paramsOf(request.url, {
		json: ['select', 'include'],
		text: [],
	})
	const read = await run(async () =>
		readerOf(api, caller.kind === 'master').fields(entry, params, ''),
	)
	bounded(api, caller, read.shape)
	const args = { ...read.read, where: { id } }
	return streamed(followed, request, read.shape, async (viewer, send) =>
		viewer.row(entry.model.name, args, send),
	)
}
