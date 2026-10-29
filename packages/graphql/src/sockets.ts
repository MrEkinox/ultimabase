// GraphQL over WebSocket (D-154): the `graphql-ws` protocol on the GraphQL
// path, each connection one viewer of its caller, its subscriptions live
// reads and its queries and mutations run as over HTTP.
import type { HttpApi, Upgrade } from '@ultimabase/http'
import type { RealtimeApi, Viewer } from '@ultimabase/realtime'
import type {
	DocumentNode,
	ExecutionArgs,
	ExecutionResult,
	GraphQLSchema,
	Source,
	ValidationRule,
} from 'graphql'
import {
	createSourceEventStream,
	executeSubscriptionEvent,
	GraphQLError,
	mapSourceToResponseEvent,
	validateSubscriptionArgs,
} from 'graphql'
import { CloseCode, handleProtocols, makeServer } from 'graphql-ws'
import type { RawData, WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import type { Caller, Client, Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { formatter } from './errors.ts'
import type { Channel } from './live-stream.ts'
import { LiveEvent, lives } from './live-stream.ts'
import type { Context } from './registry.ts'

/** How the GraphQL plugin runs a document, over HTTP as over WebSocket. */
export type Operations = {
	readonly schema: GraphQLSchema
	readonly parse: (source: string | Source) => DocumentNode
	readonly rules: (master: boolean) => readonly ValidationRule[]
	readonly validate: (
		document: DocumentNode,
		rules?: readonly ValidationRule[],
	) => readonly GraphQLError[]
	readonly execute: (args: ExecutionArgs) => Promise<ExecutionResult>
	readonly context: (caller: Caller, client: Client) => Context
	readonly hideSuggestions: boolean
	readonly format: ReturnType<typeof formatter>
	readonly logger: Logger
}

/** A connection's socket, and its viewer once `connection_init` came. */
type Extra = {
	readonly upgrade: Upgrade
	readonly socket: WebSocket
	viewer?: Viewer
	channel?: Channel
}

/** A client's buffer past which its changes are dropped, and the most it sends us. */
const maxBuffer = 1024 * 1024
/** Between pings; a socket that has not answered the last one is cut. */
const keepAlive = 12_000

const unset = () => {
	throw new Error('A cookie is set over HTTP: a WebSocket cannot set one.')
}

/** The upgrade request's cookies, which a WebSocket cannot set. */
function cookiesOf(request: Request): Client['cookies'] {
	const cookies = new Map<string, string>()
	for (const part of (request.headers.get('cookie') ?? '').split(';')) {
		const at = part.indexOf('=')
		if (at <= 0) continue
		const name = part.slice(0, at).trim()
		if (cookies.has(name)) continue
		try {
			cookies.set(name, decodeURIComponent(part.slice(at + 1).trim()))
		} catch {
			// A value that is no URI component is no cookie this API wrote.
		}
	}
	return { get: (name) => cookies.get(name), set: unset, clear: unset }
}

// How each socket sends, counted by its channel once it has one.
const sends = new WeakMap<WebSocket, (data: string) => void>()

/** The socket's channel: what it holds unsent, and when that is written. */
function channelOf(viewer: Viewer, socket: WebSocket): Channel {
	let pending = 0
	const waiters: (() => void)[] = []
	const written = () => {
		pending -= 1
		if (pending > 0) return
		for (const then of waiters.splice(0)) then()
	}
	sends.set(socket, (data) => {
		pending += 1
		socket.send(data, written)
	})
	return {
		viewer,
		full: () => socket.bufferedAmount > maxBuffer,
		drained: (then) => {
			if (pending === 0) then()
			else waiters.push(then)
		},
		forbid: () => socket.close(CloseCode.Forbidden, 'Forbidden'),
		kept: new Map(),
	}
}

const text = (data: RawData): string =>
	Buffer.concat([data].flat().map((part) => new Uint8Array(part))).toString()

const isLive = (
	value: unknown,
): value is { readonly mode?: unknown; readonly resume?: unknown } =>
	typeof value === 'object' && value !== null

/** The authorization `connection_init` gives, over the upgrade's own. */
function requestOf(upgrade: Upgrade, params: unknown): Request {
	const headers = new Headers(upgrade.request.headers)
	const authorization: unknown =
		typeof params === 'object' && params !== null
			? Reflect.get(params, 'authorization')
			: undefined
	if (typeof authorization === 'string') {
		headers.set('authorization', authorization)
	}
	return new Request(upgrade.request.url, { headers })
}

/**
 * Serves `path`'s WebSocket upgrades with `operations`, each connection read
 * by `realtime`; returns what closes them.
 */
export function serveSockets(
	http: HttpApi,
	path: string,
	realtime: RealtimeApi,
	operations: Operations,
): () => Promise<void> {
	const { schema, logger, format, hideSuggestions } = operations
	const formatted = (errors: readonly GraphQLError[]) =>
		errors.map((error) => {
			const shown = format(error)
			return shown instanceof GraphQLError
				? shown.toJSON()
				: { message: shown.message }
		})
	const server = makeServer<Record<string, unknown> | undefined, Extra>({
		schema,
		onConnect: async (ctx) => {
			const { upgrade, socket } = ctx.extra
			try {
				const request = requestOf(upgrade, ctx.connectionParams)
				const viewer = await realtime.connect(request)
				if (socket.readyState !== socket.OPEN) {
					viewer.close()
					return false
				}
				ctx.extra.viewer = viewer
				ctx.extra.channel = channelOf(viewer, socket)
				return true
			} catch (error) {
				if (!(error instanceof PublicError)) {
					logger.error({ err: error }, 'A WebSocket caller was not read.')
				}
				return false
			}
		},
		onSubscribe: (ctx, _, payload) => {
			const { viewer, channel, upgrade, socket } = ctx.extra
			if (viewer === undefined || channel === undefined || viewer.closed) {
				socket.close(CloseCode.Forbidden, 'Forbidden')
				return [new GraphQLError('Forbidden')]
			}
			let document: DocumentNode
			try {
				document = operations.parse(payload.query)
			} catch (error) {
				if (error instanceof GraphQLError) return [error]
				throw error
			}
			const { caller } = viewer
			const master = caller.kind === 'master'
			const refused = operations.validate(document, operations.rules(master))
			if (refused.length > 0) return refused
			const client = {
				address: upgrade.address,
				cookies: cookiesOf(upgrade.request),
			}
			const contextValue = operations.context(caller, client)
			const live: unknown = payload.extensions?.['live']
			const page = isLive(live) && live.mode === 'page'
			const resume = isLive(live) ? live.resume : undefined
			lives.set(contextValue, {
				channel,
				page,
				...(typeof resume === 'string' && { resume }),
			})
			return {
				schema,
				document,
				operationName: payload.operationName,
				variableValues: payload.variables,
				contextValue,
			}
		},
		execute: async (args) => operations.execute(args),
		subscribe: async (args) => {
			const validated = validateSubscriptionArgs({ ...args, hideSuggestions })
			if (!('schema' in validated)) return { errors: validated }
			const source = await createSourceEventStream(validated)
			if (!(Symbol.asyncIterator in source)) return source
			return mapSourceToResponseEvent(validated, source, async (event) => {
				const result = await executeSubscriptionEvent(event)
				const { rootValue } = event
				return rootValue instanceof LiveEvent
					? rootValue.finish(result)
					: result
			})
		},
		onNext: (_ctx, _id, _payload, _args, { data, errors, extensions }) => ({
			...(data === undefined ? {} : { data }),
			...(errors === undefined ? {} : { errors: formatted(errors) }),
			...(extensions === undefined ? {} : { extensions }),
		}),
		onError: (_ctx, _id, _payload, errors) => formatted(errors),
	})
	const sockets = new WebSocketServer({
		noServer: true,
		maxPayload: maxBuffer,
		perMessageDeflate: { threshold: 1024 },
		handleProtocols,
	})
	const beats = new WeakMap<WebSocket, () => void>()
	const opened = (socket: WebSocket, upgrade: Upgrade) => {
		const extra: Extra = { upgrade, socket }
		let alive = true
		socket.on('pong', () => {
			alive = true
		})
		beats.set(socket, () => {
			if (!alive) return socket.terminate()
			alive = false
			socket.ping()
		})
		const closed = server.opened(
			{
				protocol: socket.protocol,
				send: async (data) => {
					if (socket.readyState !== socket.OPEN) return
					const send = sends.get(socket)
					if (send === undefined) socket.send(data)
					else send(data)
				},
				close: (code, reason) => socket.close(code, reason),
				onMessage: (received) => {
					socket.on('message', (data: RawData) => {
						received(text(data)).catch((error: unknown) => {
							logger.error({ err: error }, 'A WebSocket message failed.')
							socket.close(CloseCode.InternalServerError, 'Internal error')
						})
					})
				},
			},
			extra,
		)
		socket.once('close', (code, reason) => {
			void closed(code, String(reason))
			extra.viewer?.close()
		})
	}
	const beating = setInterval(() => {
		for (const socket of sockets.clients) beats.get(socket)?.()
	}, keepAlive)
	beating.unref()
	http.upgrade(path, (upgrade) => {
		sockets.handleUpgrade(
			upgrade.incoming,
			upgrade.socket,
			upgrade.head,
			(socket) => opened(socket, upgrade),
		)
	})
	return async () => {
		clearInterval(beating)
		for (const socket of sockets.clients) socket.close(1001, 'Going away')
		await new Promise<void>((done) => {
			sockets.close(() => done())
		})
	}
}
