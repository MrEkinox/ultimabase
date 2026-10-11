// Public option types only: this module imports nothing, so the published
// declarations reference neither the driver nor plugin-kit (ADR-0320).

/** TLS settings of a URL connection; `sslmode` in the URL takes precedence. */
export interface PostgresSslOptions {
	/** Rejects a server certificate that the CA does not sign. @default true */
	readonly rejectUnauthorized?: boolean
	/** PEM certificate authority, for a private or self-signed CA. */
	readonly ca?: string
	/** PEM client certificate, for mutual TLS. */
	readonly cert?: string
	/** PEM client key, for mutual TLS. */
	readonly key?: string
}

/**
 * Pool settings of a connection created from `url` or `DATABASE_URL`
 * (ADR-0320). An injected `pool` keeps its own settings.
 *
 * @example `connection: { max: 20, statementTimeoutMs: 5000, connectRetries: 5 }`
 */
export interface PostgresConnectionOptions {
	/** Maximum number of pooled connections. @default 10 */
	readonly max?: number
	/** Requires TLS: `true` verifies the server certificate with the system CAs. */
	readonly ssl?: boolean | PostgresSslOptions
	/** Cancels a statement running longer than this, in milliseconds. @default no limit */
	readonly statementTimeoutMs?: number
	/** Closes a pooled connection idle for this long, in milliseconds; 0 keeps it. @default 10000 */
	readonly idleTimeoutMs?: number
	/**
	 * Retries the first connection this many times, waiting 0.5 s, 1 s, 2 s,
	 * 4 s, then 8 s between attempts (a database still starting in Docker or
	 * Kubernetes). @default 0
	 */
	readonly connectRetries?: number
}

/** Debugging switches of `postgresPlugin({ debug })` (ADR-0320). */
export interface PostgresDebugOptions {
	/**
	 * Logs every statement and its duration at `info`, never parameter values.
	 * @example `debug: { logQueries: true }`
	 */
	readonly logQueries?: boolean
	/**
	 * Logs statements slower than this many milliseconds at `warn`, never
	 * parameter values; cheap enough for production.
	 * @example `debug: { slowQueryMs: 500 }`
	 */
	readonly slowQueryMs?: number
}
