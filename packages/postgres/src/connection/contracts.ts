import { createServiceToken, type ServiceToken } from '@ultimabase/core'

/** Describes the lifecycle state visible without exposing the driver pool. */
export type PostgresConnectionState = 'closed' | 'connected' | 'idle'

/** Represents the only client capability needed for connection verification. */
export interface PostgresPoolClient {
	release(): void
}

/** Accepts a pg-compatible pool without publishing pg types from this package. */
export interface PostgresPool {
	connect(): Promise<PostgresPoolClient>
	end(): Promise<void>
	// The opaque signature proves query capability without exposing driver overloads.
	query(...arguments_: never[]): unknown
}

/** Exposes lifecycle control while keeping credentials and the driver pool private. */
export interface PostgresConnectionService {
	readonly state: PostgresConnectionState
	connect(): Promise<void>
	close(): Promise<void>
}

/** Identifies the application-scoped PostgreSQL connection managed by the plugin. */
export const postgresConnectionServiceToken: ServiceToken<PostgresConnectionService> =
	createServiceToken<PostgresConnectionService>(
		'ultimabase.postgres-connection',
	)
