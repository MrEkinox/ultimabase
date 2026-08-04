import type {
	FieldValidationPlan,
	PointerReferentialAction,
	ResolvedSchemaRelation,
	SchemaDefinition,
} from '@ultimabase/core'
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

/** Retains the logical pointer edge needed by synchronization and codecs. */
export interface CompiledPostgresPointer {
	readonly constraintName: string
	readonly onDelete: PointerReferentialAction
	readonly targetColumn: 'id'
	readonly targetSchema: SchemaDefinition
	readonly targetTable: string
}

/** Connects one logical field to its built Drizzle column and value boundary. */
export interface CompiledPostgresField {
	readonly codec: PostgresValueCodec
	readonly column: PgColumn
	readonly generation?: PostgresFieldGeneration
	readonly plan: FieldValidationPlan
	readonly pointer?: CompiledPostgresPointer
	readonly renamedFrom?: string
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
	readonly definition: SchemaDefinition
	readonly fields: Readonly<Record<string, CompiledPostgresField>>
	readonly indexes: readonly CompiledPostgresIndex[]
	readonly table: PgTable
	readonly tableName: string
}

/** Retains one physical foreign key owned by a hidden relation table. */
export interface CompiledPostgresRelationForeignKey {
	readonly column: 'source_id' | 'target_id'
	readonly constraintName: string
	readonly targetTable: string
}

/** Owns the single hidden join table shared by an owning relation and its inverse. */
export interface CompiledPostgresJoinRelation {
	readonly foreignKeys: readonly [
		CompiledPostgresRelationForeignKey,
		CompiledPostgresRelationForeignKey,
	]
	readonly indexes: readonly CompiledPostgresIndex[]
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
