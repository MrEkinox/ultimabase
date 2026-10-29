// WebSocket upgrades (D-154): a plugin takes a path's. One from an origin
// CORS does not allow is refused before any caller is read, so another site
// cannot open a socket with its visitor's cookies.
import type { IncomingMessage, Server } from 'node:http'
import { STATUS_CODES } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Logger } from 'ultimabase'

/**
 * An upgrade a plugin takes: Node's request, its socket and first bytes, as
 * `ws`'s `handleUpgrade` reads them, and the request `identify` reads.
 */
export interface Upgrade {
	readonly request: Request
	readonly incoming: IncomingMessage
	readonly socket: Duplex
	readonly head: Buffer
}

/** Takes an upgrade on its path; the socket is the plugin's from then on. */
export type Accept = (upgrade: Upgrade) => void

/** Answers `status` with an error as D-72 sends it, then closes the socket. */
function refuse(
	socket: Duplex,
	status: number,
	code: string,
	message: string,
): void {
	const body = JSON.stringify({ code, message })
	socket.end(
		[
			`HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}`,
			'connection: close',
			'content-type: application/json',
			`content-length: ${Buffer.byteLength(body)}`,
			'',
			body,
		].join('\r\n'),
	)
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
 * Hands each upgrade to its path's plugin, past the origin check; returns
 * the sockets taken and still open, which `stop` closes at its end.
 */
export function upgrading(
	server: Server,
	accepts: ReadonlyMap<string, Accept>,
	allows: (origin: string) => boolean,
	logger: Logger,
): ReadonlySet<Duplex> {
	const open = new Set<Duplex>()
	server.on('upgrade', (incoming: IncomingMessage, socket: Duplex, head) => {
		// A client that leaves mid-answer must not stop the server.
		socket.on('error', () => socket.destroy())
		const request = requestOf(incoming)
		if (request === undefined) {
			return refuse(socket, 400, 'BAD_REQUEST', 'The upgrade has no URL.')
		}
		const { origin, pathname } = new URL(request.url)
		const accept = accepts.get(pathname)
		if (accept === undefined) {
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
		open.add(socket)
		socket.once('close', () => open.delete(socket))
		try {
			accept({ request, incoming, socket, head })
		} catch (error) {
			logger.error({ err: error }, 'An upgrade failed.')
			refuse(socket, 500, 'INTERNAL', 'Internal error.')
		}
	})
	return open
}
