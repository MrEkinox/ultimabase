// The pool's connections, whose failures say why (D-105).
import type { PostgresPool } from 'kysely'
import type { Pool } from 'pg'
import { parse } from 'pg-connection-string'

/** The codes of a server the network does not reach, or does not know. */
const unreachable =
	/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH)$/

/** What pg-pool throws when no connection frees, or opens, in time. */
const busy = 'timeout exceeded when trying to connect'
const silent = 'Connection terminated due to connection timeout'

/**
 * `error`, or one naming the server `url` cannot reach, not its password
 * (D-105), or the connections that stayed busy.
 */
function failed(
	url: string,
	error: unknown,
	connections: number,
	wait: number,
): unknown {
	const message = error instanceof Error ? error.message : ''
	const seconds = `${wait / 1000}s`
	if (message === busy) {
		return new Error(
			`Every one of the ${connections} PostgreSQL connections stayed busy for ${seconds}: a transaction may wait on something slow or never end.`,
			{ cause: error },
		)
	}
	const code: unknown = Reflect.get(Object(error), 'code')
	const reachable = typeof code !== 'string' || !unreachable.test(code)
	if (reachable && message !== silent) return error
	const { host, port } = parse(url)
	const address = `${host || process.env['PGHOST'] || 'localhost'}:${port || 5432}`
	const why = reachable ? `no answer in ${seconds}` : code
	const reached = new Error(
		`Cannot reach PostgreSQL at ${address} (${why}): is it running, and is its url right?`,
		{ cause: error },
	)
	return reachable ? reached : Object.assign(reached, { code })
}

/** `pool`, whose failures to give a connection say why. */
export function pooled(
	url: string,
	pool: Pool,
	connections: number,
	wait: number,
): PostgresPool {
	return {
		options: pool.options,
		connect: async () => {
			try {
				return await pool.connect()
			} catch (error) {
				throw failed(url, error, connections, wait)
			}
		},
		end: async () => pool.end(),
	}
}
