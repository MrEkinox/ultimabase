import {
	databaseAdapterCapability,
	optionalCapability,
	provideAdapterRawCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type FrameworkPlugin,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
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
import { postgresPluginName } from '../constants.js'
import { postgresSchemaPreparationCapability } from '../schema-preparation-capability.js'
import { createPostgresDatabaseAdapter } from '../drizzle/adapter.js'
import { readPostgresTransactionClient } from '../drizzle/adapter.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { PostgresSchemaPolicy } from '../synchronization/contracts.js'
import { prepareDirectPostgresSchema } from '../synchronization/preparer.js'
import {
	createPostgresRawSetupFacade,
	createPostgresRawTransactionFacade,
	postgresAdapterSupportProviders,
	postgresMigrationContributionCapability,
	postgresPhysicalSchemaContributionCapability,
	postgresRawAdapterCapability,
	type PostgresAdapterMetadata,
} from '../adapter-capabilities.js'

const postgresPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: postgresPluginName,
	version: '0.0.0',
})

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
	/** Reports attributed physical and migration metadata without exposing callbacks. */
	readonly adapterMetadata: PostgresAdapterMetadata
	readonly connection: PostgresConnectionService
}

type PostgresPluginCapabilities = Readonly<{
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof postgresConnectionCapability>,
		CapabilityProviderDeclaration<typeof databaseAdapterCapability>,
		CapabilityProviderDeclaration<
			typeof postgresAdapterSupportProviders.valueStorage.token
		>,
		CapabilityProviderDeclaration<
			typeof postgresAdapterSupportProviders.constraint.token
		>,
		CapabilityProviderDeclaration<
			typeof postgresAdapterSupportProviders.persistencePlan.token
		>,
		CapabilityProviderDeclaration<
			typeof postgresAdapterSupportProviders.physicalSchema.token
		>,
		CapabilityProviderDeclaration<
			typeof postgresAdapterSupportProviders.migration.token
		>,
		CapabilityProviderDeclaration<typeof postgresRawAdapterCapability>,
	]
	readonly requires: readonly [
		CapabilityRequirement<typeof postgresConnectionCapability, false, '^1.0.0'>,
	]
	readonly optional: readonly [
		CapabilityRequirement<
			typeof postgresSchemaPreparationCapability,
			true,
			'^1.0.0'
		>,
		CapabilityRequirement<
			typeof postgresPhysicalSchemaContributionCapability,
			true,
			'^1.0.0',
			'setup'
		>,
		CapabilityRequirement<
			typeof postgresMigrationContributionCapability,
			true,
			'^1.0.0',
			'setup'
		>,
	]
}>

export type PostgresPlugin = FrameworkPlugin<
	typeof postgresPluginName,
	Readonly<PostgresPluginExports>,
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	'0.0.0',
	'^0.0.0',
	readonly [
		Readonly<{
			readonly name: 'adapter:consume'
			readonly reason: string
		}>,
	],
	undefined,
	PostgresPluginCapabilities
>

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
const optionalSchemaPreparation = optionalCapability(
	postgresSchemaPreparationCapability,
	'^1.0.0',
)
const optionalPhysicalSchemaContributions = optionalCapability(
	postgresPhysicalSchemaContributionCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const optionalMigrationContributions = optionalCapability(
	postgresMigrationContributionCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

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

/** Creates the official database capability provider without opening a connection. */
export const postgresPlugin = (
	options: PostgresPluginOptions,
): PostgresPlugin => {
	const normalizedOptions = normalizePostgresPluginOptions(options)
	const createConnectionSource =
		createConnectionSourceFactory(normalizedOptions)
	const schemaPolicy = normalizedOptions.schemaPolicy ?? 'override'
	const connectionRequirement = requireCapability(
		postgresConnectionCapability,
		'^1.0.0',
	)
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

	return postgresPluginModule.plugin({
		privileges: [
			{
				name: 'adapter:consume',
				reason:
					'Compiles protected database constraints for the PostgreSQL adapter.',
			},
		],
		capabilities: {
			optional: [
				optionalSchemaPreparation,
				optionalPhysicalSchemaContributions,
				optionalMigrationContributions,
			],
			provides: [
				connectionProvider,
				adapterProvider,
				postgresAdapterSupportProviders.valueStorage,
				postgresAdapterSupportProviders.constraint,
				postgresAdapterSupportProviders.persistencePlan,
				postgresAdapterSupportProviders.physicalSchema,
				postgresAdapterSupportProviders.migration,
				rawAdapterProvider,
			],
			requires: [connectionRequirement],
		},
		setup: ({ capabilities, schemas }) => {
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

			// Runtime-only preparation stays keyed by this application's public export object.
			const physicalSchema =
				capabilities.get(optionalPhysicalSchemaContributions) ?? []
			const migrations = capabilities.get(optionalMigrationContributions) ?? []
			const pluginExports = immutableRecord({
				adapterMetadata: immutableRecord({ migrations, physicalSchema }),
				connection,
			})

			prepareSchemaByExports.set(pluginExports, () =>
				prepareDirectPostgresSchema(
					managedConnection.getPool(),
					schemaCatalog,
					schemaPolicy,
					physicalSchema,
				),
			)

			// Setup exports safe lifecycle control; credentials and driver objects remain private.
			return pluginExports
		},
		hooks: {
			connect: ({ pluginExports }) => pluginExports.connection.connect(),
			prepareSchema: ({ capabilities, pluginExports }) => {
				if (capabilities.get(optionalSchemaPreparation) !== undefined) {
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
