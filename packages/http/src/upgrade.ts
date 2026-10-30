// WebSocket upgrades (D-154): a plugin takes a path's. One from an origin
// CORS does not allow is refused before any caller is read, so another site
// cannot open a socket with its visitor's cookies; the application's gate
// may refuse the rest, and close those open (D-166).
import type { IncomingMessage, Server } from 'node:http'
import { STATUS_CODES } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Logger } from 'ultimabase'

/**
 * An upgrade a plugin takes: Node's request, its socket and first bytes, as
 * `ws`'s `handleUpgrade` reads them, the request `identify` reads and the
 * client's address, as `proxies` reads it (D-116).
 */
export interface Upgrade {
	readonly request: Request
	readonly address: string
	readonly incoming: IncomingMessage
	readonly socket: Duplex
	readonly head: Buffer
}

/** Takes an upgrade on its path; the socket is the plugin's from then on. */
export type Accept = (upgrade: Upgrade) => void

/** Closes a plugin's sockets with a WebSocket close code (D-166). */
export type Close = (code: number, reason: string) => void

/**
 * The application's answer to an upgrade, before the plugin takes it: a
 * response refuses it, `undefined` lets it through (D-166).
 */
export type Gate = (
	request: Request,
) => Response | undefined | Promise<Response | undefined>

/** What `closeUpgrades` takes: every path's sockets, or `path`'s (D-166). */
export interface Closing {
	readonly code: number
	readonly reason?: string
	readonly path?: string
}

/** The plugin that takes a path's upgrades, and how it closes them. */
export interface Taker {
	readonly accept: Accept
	readonly close: Close | undefined
}

/** What `upgrading` reads from the server's options and plugins. */
export interface Upgrading {
	readonly takers: ReadonlyMap<string, Taker>
	readonly gate: Gate | undefined
	readonly allows: (origin: string) => boolean
	readonly addressOf: (env: { readonly incoming: IncomingMessage }) => string
	readonly logger: Logger
}

/** Sends `response` on the raw socket, then closes it. */
async function send(socket: Duplex, response: Response): Promise<void> {
	const body = Buffer.from(await response.arrayBuffer())
	const headers = new Headers(response.headers)
	headers.delete('transfer-encoding')
	headers.set('connection', 'close')
	headers.set('content-length', String(body.length))
	const head = [
		`HTTP/1.1 ${response.status} ${STATUS_CODES[response.status] ?? ''}`,
	]
	for (const [name, value] of headers) head.push(`${name}: ${value}`)
	socket.end(Buffer.concat([Buffer.from(`${head.join('\r\n')}\r\n\r\n`), body]))
}

/** Answers `status` with an error as D-72 sends it, then closes the socket. */
function refuse(
	socket: Duplex,
	status: number,
	code: string,
	message: string,
): void {
	void send(socket, Response.json({ code, message }, { status }))
}

/** The request `incoming` is, without a body; `undefined` for no valid URL. */
function requestOf(incoming: IncomingMessage): Request | undefined {
	const { host } = incoming.headers
	const target = incoming.url ?? ''
	const url = `http://${host ?? ''}${target}`
	if (host === undefined || !target.startsWith('/') || !URL.canParse(url)) {
		return undefined
	}
	const headers = new Headers()
	const raw = incoming.rawHeaders
	for (let index = 0; index + 1 < raw.length; index += 2) {
		headers.append(raw[index] ?? '', raw[index + 1] ?? '')
	}
	return new Request(url, { headers })
}

/**
 * Hands each upgrade to its path's plugin, past the origin check and the
 * gate; returns the sockets taken and still open, with their path, which
 * `stop` and `closeUpgrades` close.
 */
export function upgrading(
	server: Server,
	{ takers, gate, allows, addressOf, logger }: Upgrading,
): ReadonlyMap<Duplex, string> {
	const open = new Map<Duplex, string>()
	server.on('upgrade', (incoming: IncomingMessage, socket: Duplex, head) => {
		// A client that leaves mid-answer must not stop the server.
		socket.on('error', () => socket.destroy())
		const request = requestOf(incoming)
		if (request === undefined) {
			return refuse(socket, 400, 'BAD_REQUEST', 'The upgrade has no URL.')
		}
		const { origin, pathname } = new URL(request.url)
		const taker = takers.get(pathname)
		if (taker === undefined) {
			return refuse(socket, 404, 'NOT_FOUND', `No upgrade at ${pathname}.`)
		}
		const from = incoming.headers.origin
		if (from !== undefined && from !== origin && !allows(from)) {
			return refuse(
				socket,
				403,
				'ACCESS_DENIED',
				'A WebSocket from another origin is refused.',
			)
		}
		// Open while the gate answers, so `stop` waits for it too.
		open.set(socket, pathname)
		socket.once('close', () => open.delete(socket))
		void (async () => {
			try {
				const refused = await gate?.(request)
				if (refused !== undefined) return await send(socket, refused)
				const address = addressOf({ incoming })
				taker.accept({ request, address, incoming, socket, head })
			} catch (error) {
				logger.error({ err: error }, 'An upgrade failed.')
				refuse(socket, 500, 'INTERNAL', 'Internal error.')
			}
		})()
	})
	return open
}

/**
 * Closes the sockets open on every path, or on `path`: with each plugin's
 * `close`, or destroyed when it gave none; none before the start.
 */
export function closeUpgrades(
	takers: ReadonlyMap<string, Taker>,
	open: ReadonlyMap<Duplex, string> | undefined,
	{ code, reason = '', path }: Closing,
): void {
	if (path !== undefined && !takers.has(path)) {
		throw new Error(`No plugin takes the upgrades of ${path}.`)
	}
	if (open === undefined) return
	for (const [taken, { close }] of takers) {
		if (path !== undefined && taken !== path) continue
		if (close !== undefined) close(code, reason)
		else for (const [socket, at] of open) if (at === taken) socket.destroy()
	}
}
