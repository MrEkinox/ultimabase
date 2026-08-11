import { defineCapability, type CapabilityToken } from '@ultimabase/core'

/** Marks one application where a migration provider owns PostgreSQL schema preparation. */
export interface PostgresSchemaPreparationCapability {
	readonly kind: 'postgres-schema-preparation'
}

/** Replaces the legacy named pipeline claim with one nominal single-provider protocol. */
export const postgresSchemaPreparationCapability: CapabilityToken<
	PostgresSchemaPreparationCapability,
	PostgresSchemaPreparationCapability,
	'ultimabase.postgres-schema-preparation',
	'1.0.0',
	'single',
	'declaration'
> = defineCapability<PostgresSchemaPreparationCapability>()({
	capabilityId: 'ultimabase.postgres-schema-preparation',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})
