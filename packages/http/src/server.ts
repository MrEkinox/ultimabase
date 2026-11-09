// The port the server listens on, and its listening (D-106); the body
// limit and the drain (D-223); its connection queue (D-276); its listeners
// (D-292); how long it waits for headers (D-348).
import cluster from 'node:cluster'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import {
	createServer as createListener,
	type Server as Listener,
} from 'node:net'
import type { Duplex } from 'node:stream'
import { getRequestListener } from '@hono/node-server'
import type { Logger } from 'ultimabase'
import { Refused } from 'ultimabase'

/** The `port` option, then `PORT`, then 3000. */
export function portOf(option: number | undefined): number {
	const given = option ?? process.env['PORT']
	if (given === undefined || given === '') return 3000
	// Digits only: `Number` would also read ' ', '0x1F90' or '1e3'.
	const port =
		typeof given === 'number' || /^\d+$/.test(given)
			? Number(given)
			: Number.NaN
	if (Number.isInteger(port) && port >= 0 && port <= 65_535) return port
	const name = option === undefined ? 'PORT' : 'port'
	throw new Refused(`${name} is ${given}, not a port between 0 and 65535.`)
}

/** The `bodyLimit` option, a whole number of bytes above 0; 1 MB by default. */
export function bodyLimitOf(option: number | undefined): number {
	const bytes = option ?? 1024 * 1024
	if (Number.isInteger(bytes) && bytes > 0) return bytes
	throw new Refused(
		`bodyLimit is ${bytes}, not a whole number of bytes above 0.`,
	)
}

/** The `drain` option, in milliseconds: 5000 in production, 0 otherwise. */
export function drainOf(option: number | undefined): number {
	const ms = option ?? (process.env['NODE_ENV'] === 'production' ? 5000 : 0)
	if (Number.isInteger(ms) && ms >= 0) return ms
	throw new Refused(`drain is ${ms}, not a whole number of milliseconds.`)
}

/** The connections waiting to be accepted; the system caps it at its own. */
const backlog = 4096

/**
 * The sockets listening on the port. Node accepts one connection per turn of
 * its event loop and per socket, so a busy server takes connections this many
 * times faster (D-292). The system shares them out, on Linux only; workers of
 * a cluster already share theirs.
 */
const listeners = process.platform === 'linux' && cluster.isPrimary ? 16 : 1

/** The listeners of each server beside itself. */
const others = new WeakMap<Server, readonly Listener[]>()

/** `listener` on `port`, refused in words when another process holds it. */
async function bound(
	listener: Listener,
	port: number,
	reusePort: boolean,
): Promise<void> {
	await new Promise<void>((done, fail) => {
		const refused = (error: Error) => {
			const code: unknown = Reflect.get(error, 'code')
			fail(
				code === 'EADDRINUSE'
					? new Error(
							`Port ${port} is in use: stop the process that holds it, or set PORT.`,
							{ cause: error },
						)
					: error,
			)
		}
		listener.once('error', refused)
		listener.listen({ port, backlog, reusePort }, () => {
			listener.off('error', refused)
			done()
		})
	})
}

/** Closed, once its connections have ended. */
async function shut(listener: Listener): Promise<void> {
	await new Promise<void>((done, fail) => {
		listener.close((error) => {
			if (error === undefined) done()
			else fail(error)
		})
	})
}

const boundPort = (listener: Listener, port: number) => {
	const address = listener.address()
	return typeof address === 'object' && address !== null ? address.port : port
}

export async function listening(server: Server, port: number): Promise<number> {
	if (listeners === 1) {
		await bound(server, port, false)
		return boundPort(server, port)
	}
	// Sharing the port lets a second process in, so it must be free first.
	if (port !== 0) {
		const alone = createListener()
		await bound(alone, port, false)
		await shut(alone)
	}
	await bound(server, port, true)
	const at = boundPort(server, port)
	const rest = Array.from({ length: listeners - 1 }, () =>
		// As `node:http` makes its own, whose connections it then takes.
		createListener({ allowHalfOpen: true, noDelay: true }, (socket) => {
			server.emit('connection', socket)
		}),
	)
	others.set(server, rest)
	await Promise.all(rest.map((listener) => bound(listener, at, true)))
	return at
}

/**
 * A client that never ends its headers holds a socket 10 s, not Node's 60;
 * checked every second, not every 30.
 */
const waits = { headersTimeout: 10_000, connectionsCheckingInterval: 1000 }

/** A Node server for `fetch`, Hono's handler. */
export function serverOf(
	fetch: Parameters<typeof getRequestListener>[0],
): Server {
	const listener = getRequestListener(fetch)
	const server = createServer(waits, (request, response) => {
		// A request running when `stop` began leaves its connection idle after
		// its response: close it, rather than wait for the client to.
		response.once('finish', () => {
			if (!server.listening) server.closeIdleConnections()
		})
		void listener(request, response)
	})
	return server
}

/** How long `stop` waits for running requests: a stream never ends. */
const grace = 10_000

/**
 * Stops accepting connections, then waits for running requests and the
 * sockets plugins took (D-59), 10 seconds at most (D-106).
 */
export async function closed(
	server: Server,
	logger: Logger,
	taken: ReadonlyMap<Duplex, string>,
): Promise<void> {
	const cutting = setTimeout(() => {
		logger.warn(
			`Stopped ${grace / 1000} s after stop began: closed the requests still running.`,
		)
		server.closeAllConnections()
		for (const socket of taken.keys()) socket.destroy()
	}, grace)
	try {
		const closing = [server, ...(others.get(server) ?? [])].map(shut)
		server.closeIdleConnections()
		await Promise.all(closing)
	} finally {
		clearTimeout(cutting)
	}
}
