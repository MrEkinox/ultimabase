// The pool's connections, whose failures say why (D-105).
import type { PostgresPool } from 'kysely'
import type { PoolClient, PoolConfig } from 'pg'
import { Pool } from 'pg'
import { parse } from 'pg-connection-string'
import type { Logger } from 'ultimabase'
import { watched } from './deadline.ts'
import { preparing } from './prepared.ts'

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

/** How the pool opens its connections. */
export type Opening = {
	readonly config: PoolConfig
	readonly connections: number
	readonly wait: number
	readonly prepared: boolean
	/** A statement's most milliseconds, checked (D-331). */
	readonly timeout: number | undefined
	/** While true, a statement may take its time: a migration runs. */
	readonly spared: () => boolean
	readonly logger: Logger
}

/**
 * The pool, and its open connections, which the listener gives up when the
 * database goes silent (D-287).
 */
export function poolOf(opening: Opening): {
	readonly pool: Pool
	readonly open: ReadonlySet<PoolClient>
} {
	const { prepared, timeout } = opening
	const pool = new Pool({
		...opening.config,
		max: opening.connections,
		connectionTimeoutMillis: opening.wait,
		// A pooler may share connections: nothing there is sent ahead (D-297).
		pipeline: prepared,
		// Opening a connection costs ten reads: a quiet server keeps its
		// own, watched by the system, and a script ends without them (D-298).
		idleTimeoutMillis: 300_000,
		keepAlive: true,
		keepAliveInitialDelayMillis: 1000,
		allowExitOnIdle: true,
		// PostgreSQL ends a statement past it, a lock awaited included (D-331).
		...(timeout === undefined ? {} : { statement_timeout: timeout }),
	})
	// A connection the server ends would crash the process unheard. An
	// idle one the pool drops, and the next query opens another; one a
	// transaction holds fails its next statement, and the pool drops it
	// once given back.
	pool.on('error', () => undefined)
	const open = new Set<PoolClient>()
	pool.on('remove', (client) => open.delete(client))
	pool.on('connect', (client) => {
		open.add(client)
		client.on('error', () => undefined)
		if (timeout !== undefined) {
			watched(client, timeout, opening.spared, opening.logger)
		}
		if (prepared) preparing(client)
		// Compiling a nested read costs a hundred times more than running
		// it; queued, this runs before the client's first query (D-47).
		client.query('set jit = off').catch(() => undefined)
	})
	return { pool, open }
}
