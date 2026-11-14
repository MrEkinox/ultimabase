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
 * checked every second, not every 30. An idle connection stays 65 s, past a
 * load balancer's 60, which would otherwise reuse one Node closed: a 502. A
 * request's body arrives within 120 s, not 300, a mobile upload included.
 */
const waits = {
	headersTimeout: 10_000,
	connectionsCheckingInterval: 1000,
	keepAliveTimeout: 65_000,
	requestTimeout: 120_000,
}
/** A socket quiet that long, as a client that no longer reads, is closed. */
const idle = 120_000

/** Each server's requests not answered yet, and who waits for none. */
const answering = new WeakMap<Server, { count: number; none?: () => void }>()

/**
 * What `work` gives, as a request `stop` waits for: a request until its
 * handler returns, a stream going on after (D-395); an upgrade until its
 * plugin takes it (D-399).
 */
export async function counted<T>(
	server: Server,
	work: () => Promise<T>,
): Promise<T> {
	const running = answering.get(server) ?? { count: 0 }
	running.count += 1
	try {
		return await work()
	} finally {
		running.count -= 1
		if (running.count === 0) running.none?.()
	}
}

/** The answer to a request that comes once the stop began, as `/ready`'s. */
export const stopping = {
	code: 'UNAVAILABLE',
	message: 'The application is stopping.',
} as const

/** A Node server for `fetch`, Hono's handler. */
export function serverOf(
	fetch: Parameters<typeof getRequestListener>[0],
): Server {
	const listener = getRequestListener(async (request, env) =>
		counted(server, async () => fetch(request, env)),
	)
	const server = createServer(waits, (request, response) => {
		// Once `stop` began, it would run after the plugins it uses (D-399).
		if (!server.listening) {
			response.shouldKeepAlive = false
			response.writeHead(503, { 'content-type': 'application/json' })
			response.end(JSON.stringify(stopping))
			return
		}
		// A request running when `stop` began leaves its connection idle after
		// its response: close it, rather than wait for the client to.
		response.once('finish', () => {
			if (!server.listening) server.closeIdleConnections()
		})
		void listener(request, response)
	})
	server.setTimeout(idle)
	answering.set(server, { count: 0 })
	return server
}

/** How long `stop` waits for running requests: a stream never ends. */
const grace = 10_000

/**
 * Stops accepting connections: `answered` once no request awaits its handler,
 * before any plugin stops (D-395); `closed` once the streams and sockets the
 * plugins' `stop` ends are closed (D-59). 10 seconds at most in all (D-106).
 */
export function shutdown(
	server: Server,
	logger: Logger,
	taken: ReadonlyMap<Duplex, string>,
): Record<'answered' | 'closed', Promise<unknown>> {
	const running = answering.get(server) ?? { count: 0 }
	const cutting = setTimeout(() => {
		logger.warn(
			`Stopped ${grace / 1000} s after stop began: closed the requests still running.`,
		)
		server.closeAllConnections()
		for (const socket of taken.keys()) socket.destroy()
		running.none?.()
	}, grace)
	const shutting = [server, ...(others.get(server) ?? [])].map(shut)
	server.closeIdleConnections()
	// A connection still reading a body it was answered for turns idle later,
	// with no event: it would stay open the keep-alive timeout, 65 s.
	const idling = setInterval(() => server.closeIdleConnections(), 100)
	const closed = Promise.all(shutting).finally(() => {
		clearTimeout(cutting)
		clearInterval(idling)
	})
	closed.catch(() => undefined) // Read by `stop`, once the plugins stopped.
	const answered = new Promise<void>((done) => {
		running.none = done
		if (running.count === 0) done()
	})
	return { answered, closed }
}
