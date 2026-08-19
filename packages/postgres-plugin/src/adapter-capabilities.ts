import {
	adapterConstraintCapability,
	adapterMigrationCapability,
	adapterPersistencePlanCapability,
	adapterPhysicalSchemaCapability,
	adapterSupport,
	adapterUpgradeIntent,
	adapterValueStorageCapability,
	databasePersistencePlanCapability,
	defineAdapterContributionCapability,
	defineAdapterRawCapability,
	provideAdapterCapability,
	provideAdapterContribution,
	type AdapterContributionSnapshot,
	type AdapterContributionCapabilityToken,
	type AdapterRawCapabilityToken,
	type AdapterUpgradeIntentPayload,
	type CapabilityProviderDeclaration,
	type JsonObject,
	type JsonValue,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './connection/contracts.js'

/** Identifies PostgreSQL support without exposing a driver or connection object. */
export const postgresAdapterId = 'ultimabase.postgres' as const

/** Adds one adapter-specific desired column outside the portable logical schema. */
export type PostgresPhysicalColumnType =
	| 'bigint'
	| 'boolean'
	| 'bytea'
	| 'date'
	| 'double precision'
	| 'integer'
	| 'jsonb'
	| 'numeric'
	| 'text'
	| 'time'
	| 'timestamp'
	| 'uuid'

export interface PostgresPhysicalColumnPayload extends JsonObject {
	readonly column: Readonly<{
		readonly name: string
		readonly nullable: boolean
		readonly type: PostgresPhysicalColumnType
	}>
	readonly kind: 'column'
	readonly table: string
}

const postgresPhysicalColumnTypes = [
	'bigint',
	'boolean',
	'bytea',
	'date',
	'double precision',
	'integer',
	'jsonb',
	'numeric',
	'text',
	'time',
	'timestamp',
	'uuid',
] as const satisfies readonly PostgresPhysicalColumnType[]

/** @internal Validates bridge metadata before it reaches PostgreSQL DDL. */
export const isPostgresPhysicalColumnType = (
	value: unknown,
): value is PostgresPhysicalColumnType =>
	typeof value === 'string' &&
	postgresPhysicalColumnTypes.some((candidate) => candidate === value)

export const postgresPhysicalSchemaContributionCapability: AdapterContributionCapabilityToken<
	PostgresPhysicalColumnPayload,
	'ultimabase.postgres-physical-schema-contribution',
	'1.0.0'
> = defineAdapterContributionCapability<PostgresPhysicalColumnPayload>()({
	adapterId: postgresAdapterId,
	capabilityId: 'ultimabase.postgres-physical-schema-contribution',
	family: 'physical-schema',
	version: '1.0.0',
})

export const postgresMigrationContributionCapability: AdapterContributionCapabilityToken<
	AdapterUpgradeIntentPayload,
	'ultimabase.postgres-migration-contribution',
	'1.0.0'
> = defineAdapterContributionCapability<AdapterUpgradeIntentPayload>()({
	adapterId: postgresAdapterId,
	capabilityId: 'ultimabase.postgres-migration-contribution',
	family: 'migration',
	version: '1.0.0',
})

/** Carries PostgreSQL-specific physical metadata with Core-attributed provenance. */
export const postgresPhysicalColumn = (
	options: Readonly<{
		readonly column: PostgresPhysicalColumnPayload['column']
		readonly contributionId: string
		readonly normalizedStaticOptions?: Readonly<Record<string, JsonValue>>
		readonly table: string
	}>,
): CapabilityProviderDeclaration<
	typeof postgresPhysicalSchemaContributionCapability
> => {
	if (typeof options.table !== 'string' || options.table.length === 0) {
		throw new TypeError('PostgreSQL physical column table must be non-empty')
	}
	if (
		typeof options.column.name !== 'string' ||
		options.column.name.length === 0 ||
		!isPostgresPhysicalColumnType(options.column.type) ||
		typeof options.column.nullable !== 'boolean'
	) {
		throw new TypeError('PostgreSQL physical column metadata is invalid')
	}
	return provideAdapterContribution(
		postgresPhysicalSchemaContributionCapability,
		{
			contributionId: options.contributionId,
			...(options.normalizedStaticOptions === undefined
				? {}
				: { normalizedStaticOptions: options.normalizedStaticOptions }),
			payload: immutableRecord({
				column: immutableRecord(options.column),
				kind: 'column' as const,
				table: options.table,
			}),
			protocolVersion: 1,
		},
	)
}

/** Declares explicit logical upgrade intent without embedding PostgreSQL SQL. */
export const postgresUpgrade = (
	options: Readonly<{
		readonly contributionId: string
		readonly from: string
		readonly intent: JsonValue
		readonly normalizedStaticOptions?: Readonly<Record<string, JsonValue>>
		readonly target: AdapterUpgradeIntentPayload['target']
		readonly to: string
	}>,
): CapabilityProviderDeclaration<
	typeof postgresMigrationContributionCapability
> =>
	provideAdapterContribution(postgresMigrationContributionCapability, {
		contributionId: options.contributionId,
		...(options.normalizedStaticOptions === undefined
			? {}
			: { normalizedStaticOptions: options.normalizedStaticOptions }),
		payload: adapterUpgradeIntent({
			from: options.from,
			intent: options.intent,
			kind: 'upgrade',
			target: options.target,
			to: options.to,
		}),
		protocolVersion: 1,
	})

const postgresRawFacadeBrand: unique symbol = Symbol(
	'@ultimabase/postgres-plugin/raw-facade',
)

/** Exposes only inert dialect identity during pre-infrastructure setup. */
export interface PostgresRawSetupFacade {
	readonly [postgresRawFacadeBrand]: true
	readonly dialect: 'postgres'
	readonly scope: 'setup'
}

/** Exposes driver-level query work only inside the active Runtime transaction. */
export interface PostgresRawTransactionFacade {
	readonly [postgresRawFacadeBrand]: true
	query(
		queryText: string,
		values?: readonly unknown[],
	): Promise<PostgresQueryResult>
	readonly dialect: 'postgres'
	readonly scope: 'transaction'
}

export type PostgresRawAdapterFacade =
	PostgresRawSetupFacade | PostgresRawTransactionFacade

export const postgresRawAdapterCapability: AdapterRawCapabilityToken<
	PostgresRawAdapterFacade,
	'ultimabase.postgres-raw-adapter',
	'1.0.0'
> = defineAdapterRawCapability<PostgresRawAdapterFacade>()({
	capabilityId: 'ultimabase.postgres-raw-adapter',
	version: '1.0.0',
})

/** @internal Creates an inert setup facade without opening a connection. */
export const createPostgresRawSetupFacade = (): PostgresRawSetupFacade =>
	Object.freeze({
		[postgresRawFacadeBrand]: true as const,
		dialect: 'postgres' as const,
		scope: 'setup' as const,
	})

/** @internal Wraps one borrowed client without publishing the driver instance. */
export const createPostgresRawTransactionFacade = (
	client: PostgresPoolClient,
): PostgresRawTransactionFacade =>
	Object.freeze({
		[postgresRawFacadeBrand]: true as const,
		dialect: 'postgres' as const,
		query: async (
			queryText: string,
			values?: readonly unknown[],
		): Promise<PostgresQueryResult> => {
			if (typeof queryText !== 'string' || queryText.length === 0) {
				throw new TypeError('PostgreSQL raw query text must be non-empty')
			}
			return client.query(
				queryText,
				values === undefined ? undefined : [...values],
			)
		},
		scope: 'transaction' as const,
	})

/** Publishes every neutral support family implemented by PostgreSQL. */
/** @internal Lists exact PostgreSQL support providers for the plugin manifest. */
export interface PostgresAdapterSupportProviders {
	readonly constraint: CapabilityProviderDeclaration<
		typeof adapterConstraintCapability
	>
	readonly migration: CapabilityProviderDeclaration<
		typeof adapterMigrationCapability
	>
	readonly persistencePlan: CapabilityProviderDeclaration<
		typeof adapterPersistencePlanCapability
	>
	readonly physicalSchema: CapabilityProviderDeclaration<
		typeof adapterPhysicalSchemaCapability
	>
	readonly valueStorage: CapabilityProviderDeclaration<
		typeof adapterValueStorageCapability
	>
}

export const postgresAdapterSupportProviders: PostgresAdapterSupportProviders =
	immutableRecord({
		constraint: provideAdapterCapability(adapterConstraintCapability, {
			contributionId: 'postgres-constraint-support',
			value: adapterSupport({
				adapterId: postgresAdapterId,
				family: 'constraint',
				protocolVersion: 1,
			}),
		}),
		migration: provideAdapterCapability(adapterMigrationCapability, {
			contributionId: 'postgres-migration-support',
			value: adapterSupport({
				adapterId: postgresAdapterId,
				family: 'migration',
				protocolVersion: 1,
			}),
		}),
		persistencePlan: provideAdapterCapability(
			adapterPersistencePlanCapability,
			{
				contributionId: 'postgres-persistence-plan-support',
				value: adapterSupport({
					adapterId: postgresAdapterId,
					family: 'persistence-plan',
					kinds: databasePersistencePlanCapability.kinds,
					protocolVersion: 1,
				}),
			},
		),
		physicalSchema: provideAdapterCapability(adapterPhysicalSchemaCapability, {
			contributionId: 'postgres-physical-schema-support',
			value: adapterSupport({
				adapterId: postgresAdapterId,
				family: 'physical-schema',
				protocolVersion: 1,
			}),
		}),
		valueStorage: provideAdapterCapability(adapterValueStorageCapability, {
			contributionId: 'postgres-value-storage-support',
			value: adapterSupport({
				adapterId: postgresAdapterId,
				family: 'value-storage',
				formats: ['json'],
			}),
		}),
	})

/** Reports current bridge metadata through the safe PostgreSQL plugin export. */
export interface PostgresAdapterMetadata {
	readonly migrations: readonly AdapterContributionSnapshot<AdapterUpgradeIntentPayload>[]
	readonly physicalSchema: readonly AdapterContributionSnapshot<PostgresPhysicalColumnPayload>[]
}

/** @internal Keeps the pool type local to the raw provider factory. */
export type PostgresRawProviderSource = () => PostgresPool
