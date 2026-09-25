import {
	databaseAdapterCapability,
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideAdapterRawCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginInstance,
	type PluginPrivilegeRequest,
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
import { postgresFieldOption, postgresSchemaOption } from '../options.js'
import { createPostgresDatabaseAdapter } from '../drizzle/adapter.js'
import { readPostgresTransactionClient } from '../drizzle/adapter.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaPolicy } from '../synchronization/contracts.js'
import { prepareDirectPostgresSchema } from '../synchronization/preparer.js'
import {
	createPostgresRawSetupFacade,
	createPostgresRawTransactionFacade,
	postgresAdapterSupportProviders,
	postgresPhysicalSchemaContributionCapability,
	postgresRawAdapterCapability,
	type PostgresAdapterMetadata,
} from '../adapter-capabilities.js'

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
	/** Reports attributed physical metadata without exposing callbacks. */
	readonly adapterMetadata: PostgresAdapterMetadata
	readonly connection: PostgresConnectionService
}

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

const optionalPhysicalSchemaContributions: CapabilityRequirement<
	typeof postgresPhysicalSchemaContributionCapability,
	true,
	'^1.0.0',
	'setup'
> = optionalCapability(postgresPhysicalSchemaContributionCapability, '^1.0.0', {
	phase: 'setup',
})
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

		const hasUrl = Object.hasOwn(options, 'url')
		const hasPool = Object.hasOwn(options, 'pool')
		if (hasUrl === hasPool) {
			throw new TypeError('postgres plugin requires exactly one of url or pool')
		}

		if (hasUrl) {
			if (typeof options.url !== 'string' || options.url.length === 0) {
				throw new TypeError('postgres url must be a non-empty string')
			}

			return {
				...(schemaPolicy === undefined ? {} : { schemaPolicy }),
				url: options.url,
			}
		}

		assertPostgresPool(options.pool)
		return {
			pool: options.pool,
			...(schemaPolicy === undefined ? {} : { schemaPolicy }),
		}
	},
})

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
	'adapter:consume':
		'Compiles protected database constraints for the PostgreSQL adapter.',
} as const

type PostgresPluginCapabilities = readonly [
	typeof optionalPhysicalSchemaContributions,
	CapabilityProviderDeclaration<typeof postgresConnectionCapability>,
	CapabilityProviderDeclaration<typeof databaseAdapterCapability>,
	typeof postgresAdapterSupportProviders.valueStorage,
	typeof postgresAdapterSupportProviders.constraint,
	typeof postgresAdapterSupportProviders.persistencePlan,
	typeof postgresAdapterSupportProviders.physicalSchema,
	CapabilityProviderDeclaration<typeof postgresRawAdapterCapability>,
	typeof connectionRequirement,
]

/** Names the exact official PostgreSQL plugin definition. */
export type PostgresPlugin = PluginInstance<{
	readonly id: typeof postgresPluginName
	readonly exports: Readonly<PostgresPluginExports>
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: typeof postgresPluginEnvironment
	readonly privileges: readonly PluginPrivilegeRequest[]
	readonly capabilities: PostgresPluginCapabilities
}>

/** Creates the official database capability provider without opening a connection. */
export const postgresPlugin = (
	options: PostgresPluginOptions,
): PostgresPlugin => {
	const normalizedOptions = normalizePostgresPluginOptions(options)
	const createConnectionSource =
		createConnectionSourceFactory(normalizedOptions)
	const schemaPolicy = normalizedOptions.schemaPolicy ?? 'override'
	const connections = new WeakMap<object, ManagedPostgresConnection>()
	const catalogs = new WeakMap<object, PostgresSchemaCatalog>()
	const connectionProvider = provideCapability(postgresConnectionCapability, {
		contributionId: 'connection',
		create: ({ schemas }) => {
			const { ownsPool, pool } = createConnectionSource()
			const connection = createManagedPostgresConnection(pool, ownsPool)
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
		create: ({ capabilities, constraintCompilers, schemas }) => {
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
					constraintCompilers,
				),
			}
		},
	})
	const rawAdapterProvider = provideAdapterRawCapability(
		postgresRawAdapterCapability,
		{
			contributionId: 'postgres-raw-adapter',
			create: () => ({
				setup: createPostgresRawSetupFacade,
				transaction: (adapter) =>
					createPostgresRawTransactionFacade(
						readPostgresTransactionClient(adapter),
					),
			}),
		},
	)
	const declarations = contributeDeclarations({
		schema: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'postgres-options',
				field: { postgres: postgresFieldOption },
				schema: { postgres: postgresSchemaOption },
			})
			return undefined
		},
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

		const physicalSchema =
			capabilities.get(optionalPhysicalSchemaContributions) ?? []
		const exports = immutableRecord({
			adapterMetadata: immutableRecord({ physicalSchema }),
			connection,
		})

		return {
			exports,
			connect: () => connection.connect(),
			prepareSchema: () =>
				prepareDirectPostgresSchema(
					managedConnection.getPool(),
					schemaCatalog,
					schemaPolicy,
					physicalSchema,
				),
			stop: () => connection.close(),
		}
	})
	const instance = plugin({
		id: postgresPluginName,
		version: '0.0.0',
		core: '^0.0.0',
		environment: postgresPluginEnvironment,
		permissions: postgresPluginPermissions,
		contributions: [
			optionalPhysicalSchemaContributions,
			connectionProvider,
			adapterProvider,
			postgresAdapterSupportProviders.valueStorage,
			postgresAdapterSupportProviders.constraint,
			postgresAdapterSupportProviders.persistencePlan,
			postgresAdapterSupportProviders.physicalSchema,
			rawAdapterProvider,
			connectionRequirement,
			declarations,
			application,
		],
	})
	return instance
}
