import { createServiceToken, type ServiceToken } from '@ultimabase/core'

/** Describes the lifecycle state visible without exposing the driver pool. */
export type PostgresConnectionState = 'closed' | 'connected' | 'idle'

/** Represents the client capabilities needed for verification and transactional DDL. */
export interface PostgresPoolClient {
	query(queryText: string, values?: unknown[]): PromiseLike<PostgresQueryResult>
	/** Returns a healthy client or destroys one that may no longer be reusable. */
	release(error?: Error | boolean): void
}

/** Describes the only result shape consumed across the structural pool boundary. */
export interface PostgresQueryResult {
	readonly rows: readonly unknown[]
}

/** Accepts a pg-compatible pool without publishing pg types from this package. */
export interface PostgresPool {
	connect(): Promise<PostgresPoolClient>
	end(): Promise<void>
	// Unknown row values are narrowed by each database boundary before use.
	query(queryText: string, values?: unknown[]): PromiseLike<PostgresQueryResult>
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
