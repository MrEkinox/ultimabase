import process from 'node:process'

import { databaseAdapterCapability } from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	plugin,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginInstance,
	type PluginDeclarationContribution,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
} from '@ultimabase/core/plugin'
import {
	definePluginOptionsParser,
	deriveEnvironmentDefault,
	describeEnvironmentSource,
} from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'
import { Pool } from 'pg'

import {
	postgresConnectionCapability,
	type PostgresConnectionService,
	type PostgresPool,
} from '../connection/contracts.js'
import {
	createManagedPostgresConnection,
	type ManagedPostgresConnection,
} from '../connection/managed-connection.js'
import {
	observePostgresQueries,
	type PostgresDebugOptions,
} from '../connection/query-log.js'
import { postgresPluginName } from '../constants.js'
import { createPostgresDatabaseAdapter } from '../drizzle/adapter.js'
import {
	postgresFieldOption,
	postgresSchemaOption,
	type PostgresSchemaRules,
} from '../options.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaPolicy } from '../synchronization/contracts.js'
import { prepareDirectPostgresSchema } from '../synchronization/preparer.js'
import {
	normalizePostgresConnectionOptions,
	normalizePostgresDebugOptions,
	type PostgresConnectionOptions,
	type PostgresConnectionSettings,
} from './plugin-options.js'

/** Configures the explicit direct schema synchronization policy. */
export interface PostgresSchemaPolicyOptions {
	/**
	 * How startup reconciles the database with the registered schemas.
	 *
	 * @default `'fail'` when `NODE_ENV` is `production`, otherwise `'override'`
	 */
	readonly schemaPolicy?: PostgresSchemaPolicy
}

/** Options shared by every connection mode. */
export interface PostgresCommonOptions extends PostgresSchemaPolicyOptions {
	/**
	 * Logs statements and their durations through the plugin logger, never
	 * parameter values (ADR-0320).
	 * @example `debug: { slowQueryMs: 500 }`
	 */
	readonly debug?: PostgresDebugOptions
}

/**
 * Reads the `DATABASE_URL` environment variable when the application starts,
 * not when the plugin is created, so schemas and applications import and
 * type-check without environment (ADR-0312).
 *
 * @example `postgresPlugin()`
 */
export interface PostgresEnvironmentOptions extends PostgresCommonOptions {
	/** Pool settings of the connection created from `DATABASE_URL`. */
	readonly connection?: PostgresConnectionOptions
	readonly pool?: never
	readonly url?: never
}

/** Creates an application-owned pool from a private connection URL. */
export interface PostgresUrlOptions extends PostgresCommonOptions {
	/** Pool settings of the connection created from `url`. */
	readonly connection?: PostgresConnectionOptions
	readonly pool?: never
	/** Connection URL; it always wins over `DATABASE_URL`. */
	readonly url: string
}

/** Uses a developer-owned pg-compatible pool without taking disposal ownership. */
export interface PostgresExistingPoolOptions extends PostgresCommonOptions {
	/** An injected pool keeps its own settings. */
	readonly connection?: never
	readonly pool: PostgresPool
	readonly url?: never
}

export type PostgresPluginOptions =
	PostgresEnvironmentOptions | PostgresExistingPoolOptions | PostgresUrlOptions

/** Exposes safe lifecycle state and control without publishing credentials or the pool. */
export interface PostgresPluginExports {
	readonly connection: PostgresConnectionService
}

const postgresSchemaPolicies: ReadonlySet<unknown> =
	new Set<PostgresSchemaPolicy>(['fail', 'ignore', 'override'])
const isPostgresSchemaPolicy = (
	value: unknown,
): value is PostgresSchemaPolicy => postgresSchemaPolicies.has(value)

const isPostgresPool = (value: unknown): value is PostgresPool =>
	((typeof value === 'object' && value !== null) ||
		typeof value === 'function') &&
	'connect' in value &&
	typeof value.connect === 'function' &&
	'end' in value &&
	typeof value.end === 'function' &&
	'query' in value &&
	typeof value.query === 'function'

/** The validated plugin options: at most one of `url` and `pool`. */
type NormalizedPostgresPluginOptions = Readonly<{
	connection?: PostgresConnectionSettings
	debug?: PostgresDebugOptions
	pool?: PostgresPool
	schemaPolicy?: PostgresSchemaPolicy
	url?: string
}>

const normalizePostgresPluginOptions = definePluginOptionsParser({
	formatUnknownKey: (key) =>
		`postgres plugin contains unknown key: ${String(key)}`,
	keys: ['connection', 'debug', 'pool', 'schemaPolicy', 'url'] as const,
	name: 'postgres plugin options',
	normalize: (options): NormalizedPostgresPluginOptions => {
		const schemaPolicy = options.schemaPolicy
		if (schemaPolicy !== undefined && !isPostgresSchemaPolicy(schemaPolicy)) {
			throw new TypeError(
				'postgres schemaPolicy must be override, fail, or ignore',
			)
		}

		const debug =
			options.debug === undefined
				? {}
				: normalizePostgresDebugOptions(options.debug)
		const common = {
			...(schemaPolicy === undefined ? {} : { schemaPolicy }),
			...(Object.keys(debug).length === 0 ? {} : { debug }),
		}
		const connection =
			options.connection === undefined
				? {}
				: { connection: normalizePostgresConnectionOptions(options.connection) }
		const hasUrl = Object.hasOwn(options, 'url')
		const hasPool = Object.hasOwn(options, 'pool')
		if (hasUrl && hasPool) {
			throw new TypeError('postgres plugin accepts at most one of url or pool')
		}
		// Neither: DATABASE_URL is read when the application starts (ADR-0312).
		if (!hasUrl && !hasPool) return { ...common, ...connection }

		if (hasUrl) {
			if (typeof options.url !== 'string' || options.url.length === 0) {
				throw new TypeError('postgres url must be a non-empty string')
			}

			return { ...common, ...connection, url: options.url }
		}

		if (!isPostgresPool(options.pool)) {
			throw new TypeError(
				'postgres pool must provide connect(), end(), and query()',
			)
		}
		if (options.connection !== undefined) {
			throw new TypeError(
				'postgres connection settings apply to url or DATABASE_URL; configure an injected pool directly',
			)
		}

		return { pool: options.pool, ...common }
	},
})

const connectionRequirement: CapabilityRequirement<
	typeof postgresConnectionCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(postgresConnectionCapability, '^1.0.0')
const postgresPluginEnvironment = ['environment:network'] as const

type PostgresPluginCapabilities = readonly [
	CapabilityProviderDeclaration<typeof postgresConnectionCapability>,
	CapabilityProviderDeclaration<typeof databaseAdapterCapability>,
	typeof connectionRequirement,
]

// Keep the projection tied to the two option definitions installed below. The
// schema option projects nothing: `.with({ postgres })` types it (ADR-0320).
type PostgresOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'postgres-options'
	readonly field: Readonly<{ postgres: typeof postgresFieldOption }>
	readonly schema: Readonly<{ postgres: typeof postgresSchemaOption }>
}>

type PostgresSource =
	| PostgresOptionSource
	| PluginSchemaRulesSource<PostgresSchemaRules>

/** Names the exact official PostgreSQL plugin definition. */
export type PostgresPlugin = PluginInstance<{
	readonly id: typeof postgresPluginName
	readonly exports: Readonly<PostgresPluginExports>
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: typeof postgresPluginEnvironment
	readonly capabilities: PostgresPluginCapabilities
	readonly source: PostgresSource
}>

/**
 * Reads the connection string at start: a missing or empty `DATABASE_URL`
 * fails with a message that names the variable, never its value.
 */
const readDatabaseUrl = (): string => {
	const url = process.env.DATABASE_URL
	if (url === undefined || url.trim() === '') {
		throw new TypeError(
			'PostgreSQL has no connection: set the DATABASE_URL environment variable, or pass postgresPlugin({ url }) or postgresPlugin({ pool }).',
		)
	}
	return url
}

/**
 * Creates the official database capability provider without opening a
 * connection. Without `url` or `pool`, it reads `DATABASE_URL` at start.
 *
 * @example `UltimaBase.use(postgresPlugin())`
 */
export const postgresPlugin = (
	options: PostgresPluginOptions = {},
): PostgresPlugin => {
	// Validated values are captured so later caller mutation cannot alter setup.
	const source = normalizePostgresPluginOptions(options)
	// ADR-0292, ADR-0312: production never alters its schema unless the
	// developer opts in; read once, here, never per request.
	const schemaPolicy = deriveEnvironmentDefault<PostgresSchemaPolicy>(
		source.schemaPolicy,
		{ development: 'override', production: 'fail' },
	)
	const connectionSource =
		source.url !== undefined
			? 'the url option'
			: source.pool !== undefined
				? 'the pool option'
				: 'DATABASE_URL'
	// Application-scoped state is keyed by the schema registry of each application.
	const connections = new WeakMap<object, ManagedPostgresConnection>()
	const catalogs = new WeakMap<object, PostgresSchemaCatalog>()
	const connectionProvider = provideCapability(postgresConnectionCapability, {
		contributionId: 'connection',
		create: ({ logger, schemas }) => {
			// A URL creates an owned pool; an injected pool stays developer-owned.
			const owned = source.pool === undefined
			const pool =
				source.pool ??
				new Pool({
					...source.connection?.pool,
					connectionString: source.url ?? readDatabaseUrl(),
				})
			const connection = createManagedPostgresConnection(
				source.debug === undefined
					? pool
					: observePostgresQueries(pool, source.debug, logger),
				owned,
				{ connectRetries: source.connection?.connectRetries ?? 0, logger },
			)
			connections.set(schemas, connection)

			return {
				value: connection,
				dispose: async () => {
					connections.delete(schemas)
					catalogs.delete(schemas)
					await connection.close()
				},
			}
		},
	})
	const adapterProvider = provideCapability(databaseAdapterCapability, {
		contributionId: 'database-adapter',
		create: ({ capabilities, schemas }) => {
			void capabilities.get(connectionRequirement)
			const connection = connections.get(schemas)
			if (connection === undefined) {
				throw new TypeError('PostgreSQL connection capability is unavailable')
			}

			const schemaCatalog = new PostgresSchemaCatalog(
				schemas.values(),
				schemas.schemaTargets,
			)
			catalogs.set(schemas, schemaCatalog)

			return {
				value: createPostgresDatabaseAdapter(
					connection.getPool(),
					schemaCatalog,
				),
			}
		},
	})
	const declarations: PluginDeclarationContribution<
		readonly [],
		PostgresOptionSource
	> = contributeDeclarations({
		schema: ({ schemas }) =>
			schemas.defineOptions({
				contributionId: 'postgres-options',
				field: { postgres: postgresFieldOption },
				schema: { postgres: postgresSchemaOption },
			}),
	})
	const application = contributeApplication(
		({ capabilities, logger, schemas }) => {
			const connection: PostgresConnectionService = capabilities.get(
				connectionRequirement,
			)
			const managedConnection = connections.get(schemas)
			const schemaCatalog = catalogs.get(schemas)
			if (managedConnection === undefined || schemaCatalog === undefined) {
				throw new TypeError(
					'PostgreSQL capabilities are unavailable during setup',
				)
			}

			// ADR-0312: derived values and their sources, never the connection string.
			logger.debug(`connection from ${connectionSource}`)
			logger.debug(
				`schemaPolicy ${schemaPolicy.value} (${describeEnvironmentSource(schemaPolicy.source)})`,
			)
			return {
				exports: immutableRecord({ connection }),
				connect: () => connection.connect(),
				prepareSchema: () =>
					prepareDirectPostgresSchema(
						managedConnection.getPool(),
						schemaCatalog,
						schemaPolicy.value,
						logger,
					),
				stop: () => connection.close(),
			}
		},
	)

	return plugin({
		id: postgresPluginName,
		version: '0.0.0',
		core: '^0.0.0',
		environment: postgresPluginEnvironment,
		contributions: [
			connectionProvider,
			adapterProvider,
			connectionRequirement,
			declarations,
			application,
		],
	})
}
