export { postgresConnectionCapability } from './connection/contracts.js'
export {
	postgresAdapterId,
	postgresMigrationContributionCapability,
	postgresPhysicalColumn,
	postgresPhysicalSchemaContributionCapability,
	postgresRawAdapterCapability,
	postgresUpgrade,
} from './adapter-capabilities.js'
export type {
	PostgresAdapterMetadata,
	PostgresPhysicalColumnType,
	PostgresPhysicalColumnPayload,
	PostgresRawAdapterFacade,
	PostgresRawSetupFacade,
	PostgresRawTransactionFacade,
} from './adapter-capabilities.js'
export { postgresPluginName } from './constants.js'
export type {
	PostgresConnectionService,
	PostgresConnectionState,
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './connection/contracts.js'
export { postgresConstraintCompiler } from './constraints/definition.js'
export type {
	PostgresConstraintCompileContext,
	PostgresConstraintCompilerDefinition,
	PostgresConstraintCompilerOptions,
	PostgresConstraintField,
	PostgresConstraintInterpolation,
	PostgresConstraintPredicate,
	PostgresConstraintSqlTag,
} from './constraints/definition.js'
export { postgresPlugin } from './plugin/postgres-plugin.js'
export { postgresSchemaPreparationCapability } from './schema-preparation-capability.js'
export type { PostgresSchemaPreparationCapability } from './schema-preparation-capability.js'

export type { PostgresFieldOption, PostgresSchemaOption } from './options.js'

export type { PostgresSchemaPolicy } from './synchronization/contracts.js'
export type { PostgresSchemaPolicyOptions } from './plugin/postgres-plugin.js'
export type {
	PostgresExistingPoolOptions,
	PostgresPlugin,
	PostgresPluginExports,
	PostgresPluginOptions,
	PostgresUrlOptions,
} from './plugin/postgres-plugin.js'
