// The subscriptions (D-154): each live model's row and list, with its query's
// name, arguments and type, followed by the realtime engine. The first result
// is `{ data }`; a list then sends only what changed, under `extensions.live`,
// or its whole window in page mode.
import { badInput, connection, pageOf, run } from '@ultimabase/http/internal'
import type { LiveMessage, Upsert } from '@ultimabase/realtime'
import type {
	ExecutionResult,
	GraphQLFieldConfig,
	GraphQLResolveInfo,
} from 'graphql'
import { GraphQLError, GraphQLList, GraphQLNonNull } from 'graphql'
import type { Row } from 'ultimabase'
import { objectOf, uniqueInput, uniqueWhere } from './inputs.ts'
import type { Live } from './live-stream.ts'
import { LiveEvent, liveStream, lives } from './live-stream.ts'
import { connectionType, isMaster, listArgs, objectType } from './outputs.ts'
import { whereOf } from './pages.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import type { Key } from './select.ts'
import { grouped, rowNodes, selectOf } from './select.ts'

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

/** `window` once `changes` are applied, in their order. */
function applied<T extends { readonly id: string }>(
	window: readonly T[],
	changes: Extract<Message, { kind: 'changes' }>['changes'],
	rowOf: (upsert: Upsert) => T,
): T[] {
	let rows = [...window]
	for (const change of changes) {
		if ('remove' in change) {
			rows = rows.filter(({ id }) => id !== change.remove)
			continue
		}
		const row = rowOf(change)
		rows = rows.filter(({ id }) => id !== row.id)
		const at =
			change.after === null
				? 0
				: rows.findIndex(({ id }) => id === change.after) + 1
		rows.splice(at, 0, row)
	}
	return rows
}

const revised = (result: ExecutionResult, revision: number) => ({
	...result,
	extensions: { ...result.extensions, live: { revision } },
})

/** What a live read's messages run, with what it sent so far. */
function follower(
	info: GraphQLResolveInfo,
	connected: boolean,
	page: boolean,
): (message: Message) => LiveEvent {
	const key = String(info.path.key)
	const [edgesKey, pageInfoKey, totalCountKey] = connected
		? [keyOf(info, 'edges'), keyOf(info, 'pageInfo'), keyOf(info, 'totalCount')]
		: [undefined, undefined, undefined]
	let window: readonly Row[] = []
	let hasMore = false
	let count: number | undefined
	let pageInfo = ''
	const rootOf = (rows: readonly Row[]) =>
		connected ? connectionOf(rows, hasMore, count) : rows
	const sent = (result: ExecutionResult): ExecutionResult => {
		const at = valueAt(result.data, key)
		pageInfo = JSON.stringify(valueAt(at, pageInfoKey)) ?? ''
		return result
	}
	return (message) => {
		if (message.kind === 'row') {
			const { row, revision } = message
			return new LiveEvent(row, (result) => revised(result, revision))
		}
		const { revision } = message
		hasMore = message.hasMore ?? hasMore
		count = message.totalCount ?? count
		if (message.kind === 'reset' || page) {
			window =
				message.kind === 'reset'
					? message.rows
					: applied(window, message.changes, ({ upsert }) => upsert)
			return new LiveEvent(rootOf(window), (result) =>
				revised(sent(result), revision),
			)
		}
		const { changes } = message
		window = applied(window, changes, ({ upsert }) => ({ id: upsert.id }))
		const upserts = changes.flatMap((change) =>
			'upsert' in change ? [change.upsert] : [],
		)
		const root = connected
			? {
					...connectionOf(window, hasMore, count),
					edges: connectionOf(upserts, false, undefined).edges,
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
			const before = pageInfo
			sent(result)
			if (pageInfoKey !== undefined && pageInfo !== before) {
				live['pageInfo'] = valueAt(at, pageInfoKey)
			}
			return {
				...(result.errors && { errors: result.errors }),
				extensions: { ...result.extensions, live },
			}
		})
	}
}

/** The last result of a live read the engine closed. */
const closedEvent = () =>
	new LiveEvent(null, () => ({
		errors: [
			new GraphQLError('The live read closed.', {
				extensions: { code: 'INTERNAL' },
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
				const { read, relay } = pageOf(pagination, entry, args, master)
				const asked = relay === undefined ? read['take'] : relay.size
				const rows = typeof asked === 'number' ? asked : entry.take
				const arg = connected ? 'first' : 'take'
				if (page && rows > entry.maxTake) {
					throw badInput(
						`${arg} is at most ${entry.maxTake} on ${name} in page mode.`,
					)
				}
				const nodes = rowNodes(registry, info)
				const select = selectOf(registry, info, type, nodes, master)
				const { orderBy: order } = args
				const listed = {
					...whereOf(registry, name, args),
					...(order === undefined || order === null ? {} : { orderBy: order }),
					select,
					first: rows,
					totalCount:
						connected && grouped(info, info.fieldNodes).has('totalCount'),
				}
				return run(async () =>
					liveStream(
						channel,
						async (send) => channel.viewer.list(name, listed, send),
						follower(info, connected, page),
						closedEvent,
					),
				)
			},
			resolve: rootOf,
		},
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
