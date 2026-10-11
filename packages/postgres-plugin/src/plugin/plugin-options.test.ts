import { describe, expect, it } from 'vitest'

import type { PostgresPool } from '../connection/contracts.js'
import { postgresPlugin } from './postgres-plugin.js'
import {
	normalizePostgresConnectionOptions,
	normalizePostgresDebugOptions,
} from './plugin-options.js'

const pool: PostgresPool = {
	connect: () => Promise.reject(new TypeError('not connected')),
	end: () => Promise.resolve(),
	query: () => Promise.resolve({ rows: [] }),
}

describe('postgresPlugin connection and debug options (ADR-0320)', () => {
	it('maps connection settings to the driver pool settings', () => {
		expect(
			normalizePostgresConnectionOptions({
				connectRetries: 5,
				idleTimeoutMs: 0,
				max: 20,
				ssl: { ca: 'PEM', rejectUnauthorized: true },
				statementTimeoutMs: 5000,
			}),
		).toStrictEqual({
			connectRetries: 5,
			pool: {
				idleTimeoutMillis: 0,
				max: 20,
				ssl: { ca: 'PEM', rejectUnauthorized: true },
				statement_timeout: 5000,
			},
		})
		expect(normalizePostgresConnectionOptions({})).toStrictEqual({
			connectRetries: 0,
			pool: {},
		})
		expect(
			normalizePostgresConnectionOptions({ ssl: false }).pool,
		).toStrictEqual({ ssl: false })
	})

	it('normalizes debug switches', () => {
		expect(
			normalizePostgresDebugOptions({ logQueries: true, slowQueryMs: 200 }),
		).toStrictEqual({ logQueries: true, slowQueryMs: 200 })
		expect(normalizePostgresDebugOptions({ logQueries: false })).toStrictEqual(
			{},
		)
	})

	it.each([
		[
			{ connection: { max: 0 } },
			'postgres connection.max must be an integer of at least 1',
		],
		[
			{ connection: { max: 1.5 } },
			'postgres connection.max must be an integer of at least 1',
		],
		[
			{ connection: { statementTimeoutMs: '5s' } },
			'postgres connection.statementTimeoutMs must be an integer of at least 1',
		],
		[
			{ connection: { idleTimeoutMs: -1 } },
			'postgres connection.idleTimeoutMs must be an integer of at least 0',
		],
		[
			{ connection: { connectRetries: -1 } },
			'postgres connection.connectRetries must be an integer of at least 0',
		],
		[
			{ connection: { ssl: 'require' } },
			'postgres connection.ssl must be a boolean or an object',
		],
		[
			{ connection: { ssl: { servername: 'db' } } },
			'postgres connection.ssl contains unknown key: servername',
		],
		[
			{ connection: { ssl: { ca: 1 } } },
			'postgres connection.ssl.ca must be a PEM string',
		],
		[
			{ connection: { ssl: { rejectUnauthorized: 'no' } } },
			'postgres connection.ssl.rejectUnauthorized must be a boolean',
		],
		[
			{ connection: { min: 1 } },
			'postgres connection contains unknown key: min',
		],
		[
			{ debug: { logQueries: 'yes' } },
			'postgres debug.logQueries must be a boolean',
		],
		[
			{ debug: { slowQueryMs: 0 } },
			'postgres debug.slowQueryMs must be an integer of at least 1',
		],
		[
			{ debug: { values: true } },
			'postgres debug contains unknown key: values',
		],
		[
			{ connection: { max: 2 }, pool },
			'postgres connection settings apply to url or DATABASE_URL; configure an injected pool directly',
		],
	])('rejects %j', (options, message) => {
		expect(() => postgresPlugin(options as never)).toThrow(
			new TypeError(message),
		)
	})

	it('accepts connection settings in URL and DATABASE_URL modes and debug in every mode', () => {
		expect(() =>
			postgresPlugin({
				connection: { connectRetries: 3, max: 4 },
				debug: { logQueries: true },
				url: 'postgresql://localhost/fixture',
			}),
		).not.toThrow()
		expect(() => postgresPlugin({ connection: { max: 4 } })).not.toThrow()
		expect(() =>
			postgresPlugin({ debug: { slowQueryMs: 100 }, pool }),
		).not.toThrow()
	})
})
