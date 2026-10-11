import {
	definePluginOptionsParser,
	type PluginOptionsParser,
} from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type {
	PostgresDebugOptions,
	PostgresSslOptions,
} from '../connection/settings.js'

/** Normalized connection settings applied by the plugin. */
export interface PostgresConnectionSettings {
	readonly connectRetries: number
	/** Driver pool settings, in the driver's own names. */
	readonly pool: Readonly<{
		idleTimeoutMillis?: number
		max?: number
		ssl?: boolean | PostgresSslOptions
		statement_timeout?: number
	}>
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

const readSsl = (value: unknown): boolean | PostgresSslOptions | undefined => {
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
