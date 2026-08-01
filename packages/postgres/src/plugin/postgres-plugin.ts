import { definePlugin, type FrameworkPlugin } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { Pool } from 'pg'

import {
	postgresConnectionServiceToken,
	type PostgresConnectionService,
	type PostgresPool,
} from '../connection/contracts.js'
import { createManagedPostgresConnection } from '../connection/managed-connection.js'

/** Creates an application-owned pool from a private connection URL. */
export interface PostgresUrlOptions {
	readonly pool?: never
	readonly url: string
}

/** Uses a developer-owned pg-compatible pool without taking disposal ownership. */
export interface PostgresExistingPoolOptions {
	readonly pool: PostgresPool
	readonly url?: never
}

export type PostgresPluginOptions =
	PostgresExistingPoolOptions | PostgresUrlOptions

/** Exposes safe lifecycle state and control without publishing credentials or the pool. */
export interface PostgresPluginExports {
	readonly connection: PostgresConnectionService
}

export type PostgresPlugin = FrameworkPlugin<
	'@ultimabase/postgres',
	Readonly<PostgresPluginExports>,
	undefined,
	undefined,
	undefined,
	undefined,
	'database-adapter'
>

const postgresPluginOptionKeys = new Set(['pool', 'url'])

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

const assertPostgresPool: (value: unknown) => asserts value is PostgresPool = (
	value,
) => {
	if (
		!isObjectLike(value) ||
		!('connect' in value) ||
		typeof value.connect !== 'function' ||
		!('end' in value) ||
		typeof value.end !== 'function'
	) {
		throw new TypeError('postgres pool must provide connect() and end()')
	}
}

const assertPostgresPluginOptions: (
	options: unknown,
) => asserts options is PostgresPluginOptions = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('postgres plugin options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!postgresPluginOptionKeys.has(key)) {
			throw new TypeError(`postgres plugin contains unknown key: ${key}`)
		}
	}

	const hasUrl = Object.hasOwn(options, 'url')
	const hasPool = Object.hasOwn(options, 'pool')

	if (hasUrl === hasPool) {
		throw new TypeError('postgres plugin requires exactly one of url or pool')
	}

	if (hasUrl) {
		if (typeof options.url !== 'string' || options.url.length === 0) {
			throw new TypeError('postgres url must be a non-empty string')
		}

		return
	}

	assertPostgresPool(options.pool)
}

interface PostgresConnectionSource {
	readonly ownsPool: boolean
	readonly pool: PostgresPool
}

/** Captures validated options so later caller mutation cannot alter plugin setup. */
const createConnectionSourceFactory = (
	options: PostgresPluginOptions,
): (() => PostgresConnectionSource) => {
	if ('url' in options) {
		const url = options.url

		return () => ({
			ownsPool: true,
			pool: new Pool({ connectionString: url }),
		})
	}

	const pool = options.pool

	return () => ({ ownsPool: false, pool })
}

/** Creates the official database-slot plugin without opening a connection. */
export const postgresPlugin = (
	options: PostgresPluginOptions,
): PostgresPlugin => {
	const untrustedOptions: unknown = options

	assertPostgresPluginOptions(untrustedOptions)
	const createConnectionSource = createConnectionSourceFactory(untrustedOptions)

	return definePlugin({
		name: '@ultimabase/postgres',
		slot: 'database-adapter',
		setup: ({ services }) => {
			const { ownsPool, pool } = createConnectionSource()
			const connection: PostgresConnectionService =
				createManagedPostgresConnection(pool, ownsPool)

			services.provide(postgresConnectionServiceToken, connection)

			// Setup exports safe lifecycle control; credentials and driver objects remain private.
			return immutableRecord({ connection })
		},
		hooks: {
			connect: ({ pluginExports }) => pluginExports.connection.connect(),
			stop: ({ pluginExports }) => pluginExports.connection.close(),
		},
	})
}
