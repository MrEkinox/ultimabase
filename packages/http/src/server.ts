// The port the server listens on, and its listening (D-106); the body
// limit and the drain (D-223); its connection queue (D-276).
import type { Server } from 'node:http'
import { createServer } from 'node:http'
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

export async function listening(server: Server, port: number): Promise<number> {
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
		server.once('error', refused)
		server.listen({ port, backlog }, () => {
			server.off('error', refused)
			done()
		})
	})
	const address = server.address()
	return typeof address === 'object' && address !== null ? address.port : port
}

/** A Node server for `fetch`, Hono's handler. */
export function serverOf(
	fetch: Parameters<typeof getRequestListener>[0],
): Server {
	const listener = getRequestListener(fetch)
	const server = createServer((request, response) => {
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
	let cutting: NodeJS.Timeout | undefined
	await new Promise<void>((done, fail) => {
		server.close((error) => {
			clearTimeout(cutting)
			if (error === undefined) done()
			else fail(error)
		})
		server.closeIdleConnections()
		cutting = setTimeout(() => {
			logger.warn(
				`Stopped ${grace / 1000} s after stop began: closed the requests still running.`,
			)
			server.closeAllConnections()
			for (const socket of taken.keys()) socket.destroy()
		}, grace)
	})
}
