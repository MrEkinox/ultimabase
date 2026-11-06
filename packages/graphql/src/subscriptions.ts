// The subscriptions (D-154): each live model's row and list, with its query's
// name, arguments and type, followed by the realtime engine. The first result
// is `{ data }`; a list then sends only what changed, under `extensions.live`,
// or its whole window in page mode. A list's first result carries the token
// that resumes it once completed, grown.
import { randomUUID } from 'node:crypto'
import {
	applied,
	badInput,
	connection,
	endsOf,
	pageOf,
	run,
} from '@ultimabase/http/internal'
import type { LiveMessage } from '@ultimabase/realtime'
import type {
	ExecutionResult,
	GraphQLFieldConfig,
	GraphQLResolveInfo,
} from 'graphql'
import { GraphQLError, GraphQLList, GraphQLNonNull } from 'graphql'
import type { Caller, Row } from 'ultimabase'
import { objectOf, uniqueInput, uniqueWhere } from './inputs.ts'
import type { Keep, Live } from './live-stream.ts'
import { LiveEvent, liveStream, lives, resumed } from './live-stream.ts'
import { connectionType, isMaster, listArgs, objectType } from './outputs.ts'
import { whereOf } from './pages.ts'
import type { Pieces } from './pieces.ts'
import { cut, joined, rowsAtOnce } from './pieces.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import type { Key } from './select.ts'
import { countsOnly, grouped, rowNodes, selectOf } from './select.ts'

type Fields = { [field: string]: GraphQLFieldConfig<unknown, Context, Args> }
type Message = Exclude<LiveMessage, { readonly kind: 'closed' }>

const responseKey: Key = (node) => node.alias?.value ?? node.name.value

/** The response key of the first field named `name` the info's field selects. */
function keyOf(info: GraphQLResolveInfo, name: string): string | undefined {
	for (const [key, [first]] of grouped(info, info.fieldNodes, responseKey)) {
		if (first.name.value === name) return key
	}
	return undefined
}

const valueAt = (value: unknown, key: string | undefined): unknown =>
	key === undefined || typeof value !== 'object' || value === null
		? undefined
		: Reflect.get(value, key)

const fromTop = { size: undefined, backward: false }

/** A window from the top of its order, as a connection. */
function connectionOf(
	rows: readonly Row[],
	hasMore: boolean,
	totalCount: number | undefined,
) {
	const { edges, pageInfo } = connection(rows, fromTop, (row) => row)
	return { edges, pageInfo: { ...pageInfo, hasNextPage: hasMore }, totalCount }
}

/** A page info no message shows, so that it keeps windows from running apart. */
const unmoved = connectionOf([], false, undefined).pageInfo

const revised = (
	result: ExecutionResult,
	revision: number,
	resume?: string,
) => ({
	...result,
	extensions: {
		...result.extensions,
		live: { revision, ...(resume !== undefined && { resume }) },
	},
})

/** Where a list's root, its edges, page info and count are in the result. */
const keysOf = (info: GraphQLResolveInfo, connected: boolean) =>
	[
		String(info.path.key),
		...(connected
			? [
					keyOf(info, 'edges'),
					keyOf(info, 'pageInfo'),
					keyOf(info, 'totalCount'),
				]
			: [undefined, undefined, undefined]),
	] as const

/**
 * What a live read's messages run, with what it sent so far; a list's
 * first result carries `resume`.
 */
function follower(
	info: GraphQLResolveInfo,
	connected: boolean,
	page: boolean,
	resume?: string,
): (message: Message) => LiveEvent {
	const [key, edgesKey, pageInfoKey, totalCountKey] = keysOf(info, connected)
	let token = resume
	// Page mode resends its window, bounded by maxTake; else its ends do (D-253).
	let window: readonly Row[] = []
	let ends: readonly Row[] = []
	let hasMore = false
	let count: number | undefined
	let pageInfo = ''
	// The page info its last result ran with, whichever of it the query selects.
	let ran = ''
	const rootOf = (rows: readonly Row[]) =>
		connected ? connectionOf(rows, hasMore, count) : rows
	/** A big window in parts, whose lists make the window's (D-272). */
	const piecesOf = (rows: readonly Row[]): Pieces | undefined => {
		if (rows.length <= rowsAtOnce) return undefined
		if (!connected) {
			return {
				roots: cut(rows),
				merged: (results) => joined(results, ({ data }) => data, key),
			}
		}
		if (edgesKey === undefined) return undefined
		const whole = connectionOf(rows, hasMore, count)
		return {
			roots: cut(whole.edges).map((edges) => ({ ...whole, edges })),
			merged: (results) =>
				joined(results, ({ data }) => valueAt(data, key), edgesKey),
		}
	}
	const sent = (result: ExecutionResult): ExecutionResult => {
		const at = valueAt(result.data, key)
		pageInfo = JSON.stringify(valueAt(at, pageInfoKey)) ?? ''
		return result
	}
	/** The window's page info where the query reads it and it moved. */
	const moved = () => {
		if (pageInfoKey === undefined) return undefined
		const current = connectionOf(ends, hasMore, count).pageInfo
		const json = JSON.stringify(current)
		if (json === ran) return undefined
		ran = json
		return current
	}
	return (message) => {
		if (message.kind === 'row' || message.kind === 'value') {
			const { revision } = message
			// A live function's value may be anything its field's resolvers read.
			const row = message.kind === 'row'
			return new LiveEvent(
				row ? message.row : message.value,
				(result) => revised(result, revision),
				row,
			)
		}
		const { revision } = message
		hasMore = message.hasMore ?? hasMore
		count = message.totalCount ?? count
		if (message.kind === 'reset' || page) {
			const rows =
				message.kind === 'reset'
					? message.rows
					: applied(window, message.changes, (row) => row)
			if (page) window = rows
			ends = endsOf(
				[rows[0], rows.at(-1)].flatMap((row) => (row ? [row.id] : [])),
			)
			moved()
			const shown = token
			token = undefined
			// A whole window is costly to compare, and rarely sent to many at once.
			return new LiveEvent(
				rootOf(rows),
				(result) => revised(sent(result), revision, shown),
				false,
				piecesOf(rows),
			)
		}
		const { changes } = message
		if (message.ends !== undefined) ends = endsOf(message.ends)
		const upserts = changes.flatMap((change) =>
			'upsert' in change ? [change.upsert] : [],
		)
		// Only what this message sends may differ between windows (D-267).
		const movedTo = moved()
		const root = connected
			? {
					edges: connectionOf(upserts, false, undefined).edges,
					pageInfo: movedTo ?? unmoved,
					totalCount: message.totalCount ?? 0,
				}
			: upserts
		return new LiveEvent(root, (result) => {
			const at = valueAt(result.data, key)
			const upserted = connected ? valueAt(at, edgesKey) : at
			const shown: readonly unknown[] = Array.isArray(upserted) ? upserted : []
			let next = 0
			const live: { [key: string]: unknown } = { revision }
			if (!connected || edgesKey !== undefined) {
				live['changes'] = changes.map((change) => {
					if ('remove' in change) return change
					next += 1
					return { upsert: shown[next - 1], after: change.after }
				})
			}
			if (message.totalCount !== undefined && totalCountKey !== undefined) {
				live['totalCount'] = valueAt(at, totalCountKey)
			}
			if (movedTo !== undefined) {
				const before = pageInfo
				sent(result)
				if (pageInfo !== before) live['pageInfo'] = valueAt(at, pageInfoKey)
			}
			return {
				...(result.errors && { errors: result.errors }),
				extensions: { ...result.extensions, live },
			}
		})
	}
}

/**
 * The last result of a live read the engine closed, or of a live function
 * that failed with `error`, which the error formatter shows or masks.
 */
const closedEvent = (error?: unknown) =>
	new LiveEvent(null, () => ({
		errors: [
			error === undefined
				? new GraphQLError('The live read closed.', {
						extensions: { code: 'INTERNAL' },
					})
				: new GraphQLError('A live function failed.', {
						originalError:
							error instanceof Error
								? error
								: new Error('A live function threw.', { cause: error }),
					}),
		],
	}))

/** What a subscription's event holds; its stream only yields `LiveEvent`s. */
const rootOf = (event: unknown): unknown => Reflect.get(Object(event), 'root')

/** The WebSocket operation `context` runs in. */
function liveOf(context: Context): Live {
	const live = lives.get(context)
	if (live === undefined) throw badInput('A subscription runs over WebSocket.')
	return live
}

/** `post(where)` and `posts(where, orderBy, first)` of a live model. */
function liveFields(registry: Registry, entry: Entry): Fields {
	const name = entry.model.name
	const type = objectType(registry, name)
	const { pagination } = registry.settings
	const connected = pagination === 'connection'
	const list = connected
		? new GraphQLNonNull(connectionType(registry, `${name}Connection`, name))
		: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type)))
	// maxTake bounds page mode only, maxLive a live window (D-186).
	const wide = { ...entry, maxTake: Number.POSITIVE_INFINITY }
	// A window starts at the top of its order (D-154).
	const windowArgs = Object.fromEntries(
		Object.entries(listArgs(registry, name)).filter(
			([arg]) => !['after', 'last', 'before', 'skip'].includes(arg),
		),
	)
	return {
		[entry.single]: {
			type,
			args: {
				where: { type: new GraphQLNonNull(uniqueInput(registry, name)) },
			},
			subscribe: async (_, args, context, info) => {
				const { channel, page } = liveOf(context)
				const where = uniqueWhere(registry, name, objectOf(args['where']))
				const master = isMaster(context)
				const select = selectOf(registry, info, type, info.fieldNodes, master)
				return run(async () =>
					liveStream(
						channel,
						async (send) => channel.viewer.row(name, { where, select }, send),
						follower(info, false, page),
						closedEvent,
					),
				)
			},
			resolve: rootOf,
		},
		[entry.list]: {
			type: list,
			args: windowArgs,
			subscribe: async (_, args, context, info) => {
				const { channel, page } = liveOf(context)
				const master = isMaster(context)
				const window = pageOf(pagination, wide, args, master)
				const { read: paged, relay } = window
				const asked = relay === undefined ? paged['take'] : relay.size
				// A count alone follows a window of no row (D-226).
				const rows = countsOnly(info, info.fieldNodes, window)
					? 0
					: typeof asked === 'number'
						? asked
						: entry.take
				const arg = connected ? 'first' : 'take'
				if (page && rows > entry.maxTake) {
					throw badInput(
						`${arg} is at most ${entry.maxTake} on ${name} in page mode.`,
					)
				}
				const nodes = rowNodes(registry, info)
				const select = selectOf(registry, info, type, nodes, master)
				const { orderBy: order } = args
				const read = {
					...whereOf(registry, name, args),
					...(order === undefined || order === null ? {} : { orderBy: order }),
					select,
					totalCount:
						connected && grouped(info, info.fieldNodes).has('totalCount'),
				}
				const signature = JSON.stringify([
					name,
					page,
					keysOf(info, connected),
					read,
				])
				const { resume } = liveOf(context)
				return run(async () => {
					const taken =
						resume === undefined
							? undefined
							: await resumed(channel, resume, signature, rows)
					if (taken !== undefined) return taken
					const keep: Keep = { token: randomUUID(), signature, first: rows }
					// A kept list that grew to the limit opens again at it (D-252).
					const first =
						resume === undefined ? rows : channel.viewer.capped(name, rows)
					return liveStream(
						channel,
						async (send) => channel.viewer.list(name, { ...read, first }, send),
						follower(info, connected, page, keep.token),
						closedEvent,
						keep,
					)
				})
			},
			resolve: rootOf,
		},
	}
}

/**
 * A live function's subscription (D-154), as its query field: `value` runs
 * it as the subscriber each time it may have changed.
 */
export function followed(
	owner: string,
	field: Omit<GraphQLFieldConfig<unknown, Context, Args>, 'resolve'>,
	value: (
		args: Args,
		context: Context,
		info: GraphQLResolveInfo,
	) => Promise<unknown>,
): GraphQLFieldConfig<unknown, Context, Args> {
	return {
		...field,
		subscribe: async (_, args, context, info) => {
			const { channel } = liveOf(context)
			const compute = async (caller: Caller) =>
				value(args, { ...context, caller }, info)
			return run(async () =>
				liveStream(
					channel,
					async (send) => channel.viewer.value(owner, compute, send),
					follower(info, false, false),
					closedEvent,
				),
			)
		},
		resolve: rootOf,
	}
}

/** The live models' subscriptions, by root name. */
export function subscriptionFields(
	registry: Registry,
	live: (model: string) => boolean,
): Fields {
	const fields: Fields = {}
	for (const entry of registry.entries.values()) {
		if (entry.visible && live(entry.model.name)) {
			Object.assign(fields, liveFields(registry, entry))
		}
	}
	return fields
}
