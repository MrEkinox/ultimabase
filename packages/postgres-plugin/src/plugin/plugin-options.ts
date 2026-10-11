import {
	definePluginOptionsParser,
	type PluginOptionsParser,
} from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type { PoolConfig } from 'pg'

import type { PostgresDebugOptions } from '../connection/query-log.js'

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

/** Normalized connection settings applied by the plugin. */
export interface PostgresConnectionSettings {
	readonly connectRetries: number
	readonly pool: Readonly<
		Pick<PoolConfig, 'idleTimeoutMillis' | 'max' | 'ssl' | 'statement_timeout'>
	>
}

const readInteger = (
	value: unknown,
	path: string,
	minimum: number,
): number | undefined => {
	if (value === undefined) return undefined
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < minimum
	) {
		throw new TypeError(
			`${path} must be an integer of at least ${String(minimum)}`,
		)
	}
	return value
}

const sslKeys = ['ca', 'cert', 'key', 'rejectUnauthorized'] as const

const readSsl = (value: unknown): PoolConfig['ssl'] => {
	if (value === undefined || typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(
			'postgres connection.ssl must be a boolean or an object',
		)
	}
	const unknownKey = Object.keys(value).find(
		(key) => !sslKeys.some((known) => known === key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(
			`postgres connection.ssl contains unknown key: ${unknownKey}`,
		)
	}
	const { ca, cert, key, rejectUnauthorized } = value
	for (const [name, pem] of [
		['ca', ca],
		['cert', cert],
		['key', key],
	] as const) {
		if (pem !== undefined && typeof pem !== 'string') {
			throw new TypeError(
				`postgres connection.ssl.${name} must be a PEM string`,
			)
		}
	}
	if (
		rejectUnauthorized !== undefined &&
		typeof rejectUnauthorized !== 'boolean'
	) {
		throw new TypeError(
			'postgres connection.ssl.rejectUnauthorized must be a boolean',
		)
	}
	return Object.fromEntries(
		Object.entries({ ca, cert, key, rejectUnauthorized }).filter(
			([, setting]) => setting !== undefined,
		),
	)
}

/** Validates `connection` and maps it to the driver's pool settings. */
export const normalizePostgresConnectionOptions: PluginOptionsParser<PostgresConnectionSettings> =
	definePluginOptionsParser({
		formatUnknownKey: (key) =>
			`postgres connection contains unknown key: ${String(key)}`,
		keys: [
			'connectRetries',
			'idleTimeoutMs',
			'max',
			'ssl',
			'statementTimeoutMs',
		] as const,
		name: 'postgres connection',
		normalize: (options): PostgresConnectionSettings => {
			const max = readInteger(options.max, 'postgres connection.max', 1)
			const statementTimeout = readInteger(
				options.statementTimeoutMs,
				'postgres connection.statementTimeoutMs',
				1,
			)
			const idleTimeout = readInteger(
				options.idleTimeoutMs,
				'postgres connection.idleTimeoutMs',
				0,
			)
			const ssl = readSsl(options.ssl)

			return {
				connectRetries:
					readInteger(
						options.connectRetries,
						'postgres connection.connectRetries',
						0,
					) ?? 0,
				pool: immutableRecord({
					...(max === undefined ? {} : { max }),
					...(ssl === undefined ? {} : { ssl }),
					...(statementTimeout === undefined
						? {}
						: { statement_timeout: statementTimeout }),
					...(idleTimeout === undefined
						? {}
						: { idleTimeoutMillis: idleTimeout }),
				}),
			}
		},
	})

/** Validates `debug`; both switches off means no query observation at all. */
export const normalizePostgresDebugOptions: PluginOptionsParser<PostgresDebugOptions> =
	definePluginOptionsParser({
		formatUnknownKey: (key) =>
			`postgres debug contains unknown key: ${String(key)}`,
		keys: ['logQueries', 'slowQueryMs'] as const,
		name: 'postgres debug',
		normalize: (options): PostgresDebugOptions => {
			const { logQueries } = options
			if (logQueries !== undefined && typeof logQueries !== 'boolean') {
				throw new TypeError('postgres debug.logQueries must be a boolean')
			}
			const slowQueryMs = readInteger(
				options.slowQueryMs,
				'postgres debug.slowQueryMs',
				1,
			)
			return {
				...(logQueries === true ? { logQueries } : {}),
				...(slowQueryMs === undefined ? {} : { slowQueryMs }),
			}
		},
	})
