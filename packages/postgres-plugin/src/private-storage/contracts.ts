import type {
	PrivateStorageAdapterCollection,
	PrivateStorageOperationRequest,
} from '@ultimabase/core'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { CompiledPostgresField } from '../schema/contracts.js'

/** Keeps one private descriptor beside its non-public compiled PostgreSQL table. */
export interface CompiledPostgresPrivateCollection {
	readonly definition: PrivateStorageAdapterCollection
	readonly fields: Readonly<Record<string, CompiledPostgresField>>
	readonly table: PgTable
	readonly tableName: string
}

/** Resolves one configured collection without exposing catalog mutation. */
export interface PostgresPrivateStorageCatalog {
	getPrivateCollection(
		collection: PrivateStorageOperationRequest['collection'],
	): CompiledPostgresPrivateCollection
}

/** Builds one complete result projection from private field columns. */
export type PrivatePostgresSelection = Readonly<Record<string, PgColumn>>
