// A live model's list and row over Server-Sent Events (D-154): the read's
// JSON as `event: data`, then what changed as `event: live`, the JSON GraphQL
// sends under `extensions.live`; in page mode, `event: data` each time. A
// list first sends the token that resumes it, as `event: resume`. A live
// function sends its whole result as `event: data` each time it changes.
import {
	applied,
	badInput,
	connection,
	endsOf,
	run,
} from '@ultimabase/http/internal'
import type { Caller, Logger, Row } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { logFailure } from 'ultimabase/internal'
import type { Api, Args, Entry } from './entries.ts'
import { readerOf } from './fields.ts'
import type { Shape } from './shapes.ts'
import { shaped } from './shapes.ts'
import { bounded } from './limits.ts'
import { paramsOf } from './params.ts'
import type { Live, Sink, Write } from './streams.ts'
import { streamed } from './streams.ts'

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
	// Page mode resends its window, bounded by maxTake; else its ends do (D-253).
	let window: readonly Row[] = []
	let ends: readonly Row[] = []
	let hasMore = false
	let count: number | undefined
	let pageInfo = ''
	const infoOf = () => {
		const { pageInfo: info } = connection(ends, fromTop, () => null)
		return { ...info, hasNextPage: hasMore }
	}
	const data = (rows: readonly Row[], revision: number) => {
		if (!connected) return events.send('data', rows.map(node), revision)
		const info = infoOf()
		pageInfo = JSON.stringify(info)
		const { edges } = connection(rows, fromTop, node)
		const body = {
			edges,
			pageInfo: info,
			...(counted && { totalCount: count }),
		}
		events.send('data', body, revision)
	}
	return (message) => {
		const { revision } = message
		hasMore = message.hasMore ?? hasMore
		count = message.totalCount ?? count
		if (message.kind === 'reset' || page) {
			const rows =
				message.kind === 'reset'
					? message.rows
					: applied(window, message.changes)
			if (page) window = rows
			ends = endsOf(
				[rows[0], rows.at(-1)].flatMap((row) => (row ? [row.id] : [])),
			)
			return data(rows, revision)
		}
		const { changes } = message
		if (message.ends !== undefined) ends = endsOf(message.ends)
		const live: { [key: string]: unknown } = {
			revision,
			changes: changes.map((change) => {
				if ('remove' in change) return change
				const upsert = connected
					? connection([change.upsert], fromTop, node).edges[0]
					: node(change.upsert)
				return { upsert, after: change.after }
			}),
		}
		if (counted && message.totalCount !== undefined) {
			live['totalCount'] = message.totalCount
		}
		const info = connected ? infoOf() : undefined
		if (info !== undefined && JSON.stringify(info) !== pageInfo) {
			pageInfo = JSON.stringify(info)
			live['pageInfo'] = info
		}
		events.send('live', live, revision)
	}
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
		text: ['mode', 'resume'],
	})
	const { totalCount, mode, resume, ...args } = params
	if (totalCount !== undefined && typeof totalCount !== 'boolean') {
		throw badInput('totalCount must be true or false.')
	}
	if (mode !== undefined && mode !== 'page') {
		throw badInput('mode must be page.')
	}
	const { name } = entry.model
	// maxTake bounds page mode only, maxLive a live window (D-186).
	const wide = { ...entry, maxTake: Number.POSITIVE_INFINITY }
	const reader = readerOf(api, caller.kind === 'master')
	const read = await run(async () => reader.list(wide, args, ''))
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
		// A kept list that grew to the limit opens again at it (D-252).
		async (viewer, send) =>
			viewer.list(
				name,
				typeof resume === 'string'
					? { ...listed, first: viewer.capped(name, rows) }
					: listed,
				send,
			),
		{
			write: (events) =>
				listWriter(events, connected, page, totalCount === true, read.shape),
			signature: JSON.stringify([name, page, { ...listed, first: undefined }]),
			first: rows,
			resume: typeof resume === 'string' ? resume : undefined,
		},
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
		// A live row is not resumed: it starts afresh.
		text: ['resume'],
	})
	const { resume: _, ...fields } = params
	const read = await run(async () =>
		readerOf(api, caller.kind === 'master').fields(entry, fields, ''),
	)
	bounded(api, caller, read.shape)
	const args = { ...read.read, where: { id } }
	return streamed(followed, request, read.shape, async (viewer, send) =>
		viewer.row(entry.model.name, args, send),
	)
}

/** A live function's error as its client gets it: public as is, else masked and logged. */
function failure(error: unknown, logger: Logger): unknown {
	if (error instanceof PublicError) {
		const { code, message, details } = error
		return details === undefined
			? { code, message }
			: { code, message, details }
	}
	const correlationId = logFailure(logger, error, 'A live function failed.')
	return { code: 'INTERNAL', message: 'Internal error.', correlationId }
}

const noShape: Shape = { fields: [] }

/**
 * `GET /api/functions/:name` with `Accept: text/event-stream`: the result
 * `compute` gives as the subscriber, again each time it changes.
 */
export async function liveValue(
	live: Live | undefined,
	owner: string,
	request: Request,
	compute: (caller: Caller) => Promise<unknown>,
): Promise<Response> {
	if (live === undefined || !live.realtime.liveFunction(owner)) {
		// A plugin's function, `plugin.name`, is made live by the app (D-362).
		const how = owner.includes('.')
			? "name it in realtime's liveFunctions"
			: 'list realtime() in its use'
		throw badInput(`${owner} is not live: ${how}.`)
	}
	const { logger } = live
	return streamed(live, request, noShape, async (viewer, send) =>
		viewer.value(owner, compute, (message) => {
			if (message.kind !== 'closed' || message.error === undefined) {
				return send(message)
			}
			send({ kind: 'closed', error: failure(message.error, logger) })
		}),
	)
}
