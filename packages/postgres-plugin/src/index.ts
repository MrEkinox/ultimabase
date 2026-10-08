export { postgresConnectionCapability } from './connection/contracts.js'
export { postgresPluginName } from './constants.js'
export type {
	PostgresConnectionService,
	PostgresConnectionState,
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './connection/contracts.js'
export { postgresPlugin } from './plugin/postgres-plugin.js'

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
