import type {
	FieldValidationPlan,
	ResolvedSchemaRelation,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
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

/** Orients one direct pointer for Drizzle eager loading without changing storage. */
export interface CompiledPostgresPointerRelation {
	readonly fieldPath: readonly string[]
	readonly source: CompiledPostgresSchema
	readonly target: CompiledPostgresSchema
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

/** Resolves one compiled field through the shared adapter invariant. */
export const resolveCompiledPostgresField = (
	schema: CompiledPostgresSchema,
	fieldName: string,
): CompiledPostgresField => {
	const field = schema.fields[fieldName]

	if (field === undefined) {
		throw new TypeError(
			`PostgreSQL query references missing field: ${fieldName}`,
		)
	}

	if (schema.definition.definition.fields[fieldName] !== field.plan.field) {
		throw new TypeError(
			`PostgreSQL compiled field plan does not match schema field: ${fieldName}`,
		)
	}

	return field
}

/** Builds a Drizzle projection keyed by logical UltimaBase field names. */
export const compilePostgresSelection = (
	schema: CompiledPostgresSchema,
	fieldNames: readonly string[] = Object.keys(schema.fields),
): Readonly<Record<string, PgColumn>> =>
	immutableRecord(
		Object.fromEntries(
			fieldNames.map((name) => [
				name,
				resolveCompiledPostgresField(schema, name).column,
			]),
		),
	)
