import {
	databaseAdapterCapability,
	contributeApplication,
	contributeDeclarations,
	plugin,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginInstance,
	type PluginDeclarationContribution,
	type PluginPrivilegeRequest,
	type PluginSchemaOptionSource,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
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
import { postgresPluginName } from '../constants.js'
import { createPostgresDatabaseAdapter } from '../drizzle/adapter.js'
import { postgresFieldOption, postgresSchemaOption } from '../options.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaPolicy } from '../synchronization/contracts.js'
import { prepareDirectPostgresSchema } from '../synchronization/preparer.js'

/** Configures the explicit direct schema synchronization policy. */
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

const normalizePostgresPluginOptions = definePluginOptionsParser({
	formatUnknownKey: (key) =>
		`postgres plugin contains unknown key: ${String(key)}`,
	keys: ['pool', 'schemaPolicy', 'url'] as const,
	name: 'postgres plugin options',
	normalize: (options): PostgresPluginOptions => {
		const schemaPolicy = options.schemaPolicy
		if (schemaPolicy !== undefined && !isPostgresSchemaPolicy(schemaPolicy)) {
			throw new TypeError(
				'postgres schemaPolicy must be override, fail, or ignore',
			)
		}

		const policy = schemaPolicy === undefined ? {} : { schemaPolicy }
		const hasUrl = Object.hasOwn(options, 'url')
		if (hasUrl === Object.hasOwn(options, 'pool')) {
			throw new TypeError('postgres plugin requires exactly one of url or pool')
		}

		if (hasUrl) {
			if (typeof options.url !== 'string' || options.url.length === 0) {
				throw new TypeError('postgres url must be a non-empty string')
			}

			return { ...policy, url: options.url }
		}

		if (!isPostgresPool(options.pool)) {
			throw new TypeError(
				'postgres pool must provide connect(), end(), and query()',
			)
		}

		return { pool: options.pool, ...policy }
	},
})

const connectionRequirement: CapabilityRequirement<
	typeof postgresConnectionCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(postgresConnectionCapability, '^1.0.0')
const postgresPluginEnvironment = ['environment:network'] as const
const postgresPluginPermissions = {
	'schema:declare':
		'Declares the official PostgreSQL schema and field options.',
} as const

type PostgresPluginCapabilities = readonly [
	CapabilityProviderDeclaration<typeof postgresConnectionCapability>,
	CapabilityProviderDeclaration<typeof databaseAdapterCapability>,
	typeof connectionRequirement,
]

// Keep the public projection tied to the two option definitions installed below.
type PostgresOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'postgres-options'
	readonly field: Readonly<{ postgres: typeof postgresFieldOption }>
	readonly schema: Readonly<{ postgres: typeof postgresSchemaOption }>
}>

/** Names the exact official PostgreSQL plugin definition. */
export type PostgresPlugin = PluginInstance<{
	readonly id: typeof postgresPluginName
	readonly exports: Readonly<PostgresPluginExports>
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: typeof postgresPluginEnvironment
	readonly privileges: readonly PluginPrivilegeRequest[]
	readonly capabilities: PostgresPluginCapabilities
	readonly source: PostgresOptionSource
}>

/** Creates the official database capability provider without opening a connection. */
export const postgresPlugin = (
	options: PostgresPluginOptions,
): PostgresPlugin => {
	// Validated values are captured so later caller mutation cannot alter setup.
	const source = normalizePostgresPluginOptions(options)
	const schemaPolicy = source.schemaPolicy ?? 'override'
	// Application-scoped state is keyed by the schema registry of each application.
	const connections = new WeakMap<object, ManagedPostgresConnection>()
	const catalogs = new WeakMap<object, PostgresSchemaCatalog>()
	const connectionProvider = provideCapability(postgresConnectionCapability, {
		contributionId: 'connection',
		create: ({ schemas }) => {
			// A URL creates an owned pool; an injected pool stays developer-owned.
			const connection =
				'url' in source
					? createManagedPostgresConnection(
							new Pool({ connectionString: source.url }),
							true,
						)
					: createManagedPostgresConnection(source.pool, false)
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
	const application = contributeApplication(({ capabilities, schemas }) => {
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

		return {
			exports: immutableRecord({ connection }),
			connect: () => connection.connect(),
			prepareSchema: () =>
				prepareDirectPostgresSchema(
					managedConnection.getPool(),
					schemaCatalog,
					schemaPolicy,
				),
			stop: () => connection.close(),
		}
	})

	return plugin({
		id: postgresPluginName,
		version: '0.0.0',
		core: '^0.0.0',
		environment: postgresPluginEnvironment,
		permissions: postgresPluginPermissions,
		contributions: [
			connectionProvider,
			adapterProvider,
			connectionRequirement,
			declarations,
			application,
		],
	})
}
