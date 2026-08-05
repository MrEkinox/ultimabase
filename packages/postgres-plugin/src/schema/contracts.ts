import type {
	FieldValidationPlan,
	ResolvedSchemaRelation,
	SchemaDefinition,
} from '@ultimabase/core'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

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

/** Lists index methods emitted and synchronized by the PostgreSQL adapter. */
export type PostgresIndexMethod = 'btree' | 'gin'

/** Retains framework-owned generation facts that do not become database defaults. */
export interface PostgresFieldGeneration {
	readonly on: 'create' | 'createAndUpdate'
	readonly uuidVersion?: 7
}

/** Connects one logical field to its built Drizzle column and value boundary. */
export interface CompiledPostgresField {
	readonly column: PgColumn
	readonly generation?: PostgresFieldGeneration
	readonly plan: FieldValidationPlan
	readonly renamedFrom?: string
	readonly storage: PostgresStorageKind
}

/** Keeps one schema's internal Drizzle table and field lookup together. */
export interface CompiledPostgresSchema {
	readonly definition: SchemaDefinition
	readonly fields: Readonly<Record<string, CompiledPostgresField>>
	readonly table: PgTable
	readonly tableName: string
}

/** Owns the single hidden join table shared by an owning relation and its inverse. */
export interface CompiledPostgresJoinRelation {
	readonly owner: ResolvedSchemaRelation
	readonly sourceColumn: PgColumn
	readonly table: PgTable
	readonly tableName: string
	readonly targetColumn: PgColumn
}

/** Orients physical edge storage for one exact logical relation declaration. */
export interface CompiledPostgresRelation {
	readonly relation: ResolvedSchemaRelation
	readonly source: CompiledPostgresSchema
	readonly target: CompiledPostgresSchema
	readonly storage:
		| Readonly<{
				readonly kind: 'join'
				readonly relation: CompiledPostgresJoinRelation
				readonly sourceColumn: PgColumn
				readonly targetColumn: PgColumn
		  }>
		| Readonly<{
				readonly kind: 'pointer'
				readonly targetColumn: PgColumn
		  }>
}
