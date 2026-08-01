import type { FieldValidationPlan } from '@ultimabase/schema'
import type { Index, PgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { PostgresValueCodec } from './value-codec.js'

/** Lists physical column families needed by synchronization and query compilation. */
export type PostgresStorageKind =
	| 'bigint'
	| 'boolean'
	| 'bytea'
	| 'date'
	| 'double precision'
	| 'jsonb'
	| 'numeric'
	| 'text'
	| 'time'
	| 'timestamp'
	| 'uuid'

/** Retains framework-owned generation facts that do not become database defaults. */
export interface PostgresFieldGeneration {
	readonly on: 'create' | 'createAndUpdate'
	readonly uuidVersion?: 7
}

/** Connects one logical field to its built Drizzle column and value boundary. */
export interface CompiledPostgresField {
	readonly codec: PostgresValueCodec
	readonly column: PgColumn
	readonly generation?: PostgresFieldGeneration
	readonly plan: FieldValidationPlan
	readonly storage: PostgresStorageKind
}

/** Retains normalized index fields for later conflict-target compilation. */
export interface CompiledPostgresIndex {
	readonly fields: readonly [string, ...string[]]
	readonly index: Index
	readonly name: string
	readonly unique: boolean
}

/** Keeps one schema's internal Drizzle table and field lookup together. */
export interface CompiledPostgresSchema {
	readonly fields: Readonly<Record<string, CompiledPostgresField>>
	readonly indexes: readonly CompiledPostgresIndex[]
	readonly table: PgTable
	readonly tableName: string
}
