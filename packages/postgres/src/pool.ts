// The pool's connections, whose failures say why (D-105).
import type { PostgresPool } from 'kysely'
import type { PoolClient, PoolConfig } from 'pg'
import { Pool } from 'pg'
import { parse } from 'pg-connection-string'
import type { Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { logFailure } from 'ultimabase/internal'
import { counted } from './counted.ts'
import { watched } from './deadline.ts'
import { preparing } from './prepared.ts'

/** Codes of a server unreachable, unknown, cutting, or not open now (57P03). */
const unreachable =
	/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EPIPE|57P03)$/

/** No connection freed or opened in time; the server closed the one it opened. */
const waited = 'timeout exceeded when trying to connect'
const silent = 'Connection terminated due to connection timeout'
const cut = 'Connection terminated unexpectedly'

/** Every connection stayed taken, or the server takes no more (D-396). */
function busy(error: unknown): boolean {
	const code: unknown = Reflect.get(Object(error), 'code')
	if (code === '53300' || code === '53400') return true
	return error instanceof Error && error.message === waited
}

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
	const code: unknown = Reflect.get(Object(error), 'code')
	if (busy(error)) {
		return new Error(
			message === waited
				? `Every one of the ${connections} PostgreSQL connections stayed busy for ${seconds}: a transaction may wait on something slow or never end.`
				: `PostgreSQL takes no more connections (${String(code)}): keep connections times the server processes below its max_connections.`,
			{ cause: error },
		)
	}
	const reachable = typeof code !== 'string' || !unreachable.test(code)
	if (reachable && message !== silent && message !== cut) return error
	const { host, port } = parse(url)
	const address = `${host || process.env['PGHOST'] || 'localhost'}:${port || 5432}`
	const why =
		message === silent
			? `no answer in ${seconds}`
			: typeof code === 'string'
				? code
				: 'closed'
	const reached = new Error(
		`Cannot reach PostgreSQL at ${address} (${why}): is it running, and is its url right?`,
		{ cause: error },
	)
	return reachable ? reached : Object.assign(reached, { code })
}

/** How `pooled` tells why no connection came. */
export type Pooling = {
	readonly url: string
	readonly connections: number
	readonly wait: number
	readonly logger: Logger
	/** Once true, a request waits on it: a client is told to come back. */
	readonly serving: () => boolean
}

/**
 * `pool`, whose failures to give a connection say why. Once it serves, the
 * client is told to try again shortly, and the reason is logged (D-335).
 */
export function pooled(pool: Pool, pooling: Pooling): PostgresPool {
	const { url, connections, wait, logger, serving } = pooling
	return {
		options: pool.options,
		connect: async () => {
			try {
				return await pool.connect()
			} catch (error) {
				const reason = failed(url, error, connections, wait)
				if (reason === error || !serving()) throw reason
				logFailure(logger, reason, 'A request found no database connection.')
				throw new PublicError(
					'UNAVAILABLE',
					busy(error)
						? 'The database is busy: try again shortly.'
						: 'The database cannot be reached: try again shortly.',
					{ details: { retryAfter: 1 }, cause: reason },
				)
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
		counted(client)
		// Compiling a nested read costs a hundred times more than running
		// it; queued, this runs before the client's first query (D-47).
		client.query('set jit = off').catch(() => undefined)
	})
	return { pool, open }
}
