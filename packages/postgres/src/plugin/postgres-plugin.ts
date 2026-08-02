import {
	definePlugin,
	extensionHandlerKey,
	type FrameworkPlugin,
} from '@ultimabase/core'
import { databaseAdapterServiceToken } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { Pool } from 'pg'

import {
	postgresConnectionServiceToken,
	type PostgresConnectionService,
	type PostgresPool,
} from '../connection/contracts.js'
import { createManagedPostgresConnection } from '../connection/managed-connection.js'
import {
	postgresColumnExtensionName,
	postgresPluginName,
	postgresSchemaPreparationClaimName,
	postgresTableExtensionName,
} from '../constants.js'
import { createPostgresDatabaseAdapter } from '../drizzle/adapter.js'
import { resolvePostgresRenamedFrom } from '../naming/column.js'
import { resolvePostgresTableName } from '../naming/table.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaPolicy } from '../synchronization/contracts.js'
import { prepareDirectPostgresSchema } from '../synchronization/preparer.js'

/** Configures direct schema behavior when no migration plugin claims preparation. */
export interface PostgresSchemaPolicyOptions {
	readonly schemaPolicy?: PostgresSchemaPolicy
}

/** Creates an application-owned pool from a private connection URL. */
export interface PostgresUrlOptions extends PostgresSchemaPolicyOptions {
	readonly pool?: never
	readonly url: string
}

/** Uses a developer-owned pg-compatible pool without taking disposal ownership. */
export interface PostgresExistingPoolOptions extends PostgresSchemaPolicyOptions {
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
	typeof postgresPluginName,
	Readonly<PostgresPluginExports>,
	undefined,
	undefined,
	undefined,
	undefined,
	'database-adapter'
>

const postgresPluginOptionKeys = new Set(['pool', 'schemaPolicy', 'url'])
const postgresSchemaPolicies = [
	'fail',
	'ignore',
	'override',
] as const satisfies readonly PostgresSchemaPolicy[]
const isPostgresSchemaPolicy = (
	value: unknown,
): value is PostgresSchemaPolicy =>
	typeof value === 'string' &&
	postgresSchemaPolicies.some((policy) => policy === value)

type PrepareSchema = () => Promise<void>
const prepareSchemaByExports = new WeakMap<
	Readonly<PostgresPluginExports>,
	PrepareSchema
>()

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
		typeof value.end !== 'function' ||
		!('query' in value) ||
		typeof value.query !== 'function'
	) {
		throw new TypeError(
			'postgres pool must provide connect(), end(), and query()',
		)
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

	if (
		options.schemaPolicy !== undefined &&
		!isPostgresSchemaPolicy(options.schemaPolicy)
	) {
		throw new TypeError(
			'postgres schemaPolicy must be override, fail, or ignore',
		)
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
	const schemaPolicy = untrustedOptions.schemaPolicy ?? 'override'

	return definePlugin({
		name: postgresPluginName,
		slot: 'database-adapter',
		setup: ({ constraintCompilers, registries, schemas, services }) => {
			registries.extensions.register(
				extensionHandlerKey('field', postgresColumnExtensionName),
				resolvePostgresRenamedFrom,
			)
			registries.extensions.register(
				extensionHandlerKey('schema', postgresTableExtensionName),
				resolvePostgresTableName,
			)
			// Compile declaration-only metadata before allocating an owned connection pool.
			const schemaCatalog = new PostgresSchemaCatalog(schemas.values())
			const { ownsPool, pool } = createConnectionSource()
			const managedConnection = createManagedPostgresConnection(pool, ownsPool)
			const adapter = createPostgresDatabaseAdapter(
				managedConnection.getPool(),
				schemaCatalog,
				constraintCompilers,
			)
			const connection: PostgresConnectionService = managedConnection

			services.provide(postgresConnectionServiceToken, connection)
			services.provide(databaseAdapterServiceToken, adapter)

			// Runtime-only preparation stays keyed by this application's public export object.
			const pluginExports = immutableRecord({ connection })

			prepareSchemaByExports.set(pluginExports, () =>
				prepareDirectPostgresSchema(pool, schemaCatalog, schemaPolicy),
			)

			// Setup exports safe lifecycle control; credentials and driver objects remain private.
			return pluginExports
		},
		hooks: {
			connect: ({ pluginExports }) => pluginExports.connection.connect(),
			prepareSchema: ({ pluginExports, registries }) => {
				if (registries.pipelines.has(postgresSchemaPreparationClaimName)) {
					return
				}

				const prepareSchema = prepareSchemaByExports.get(pluginExports)

				if (prepareSchema === undefined) {
					throw new TypeError('PostgreSQL schema preparer is unavailable')
				}

				return prepareSchema()
			},
			stop: ({ pluginExports }) => pluginExports.connection.close(),
		},
	})
}
