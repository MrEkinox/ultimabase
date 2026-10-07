import type {
	SchemaCompiledTargetIdentity,
	SchemaDefinition,
	SchemaFields,
	SchemaMetadata,
} from './definition.js'
import type { SchemaIndexOptions } from './indexes.js'
import { SchemaCompilationError } from './definition-error.js'

// A versioned global symbol preserves constructor provenance across package copies.
export const schemaDefinitionMarker: symbol = Symbol.for(
	'@ultimabase/core/schema-definition/v1',
)

export interface NormalizedSchemaDeclaration {
	readonly className: string
	readonly fields: Readonly<Record<string, unknown>>
	readonly indexes: readonly SchemaIndexOptions[] | undefined
	readonly options: Readonly<Record<string, unknown>>
}

export interface CompiledSchemaRecord {
	readonly definition: SchemaMetadata
	readonly developerFields: SchemaFields
	readonly targets: readonly SchemaCompiledTargetIdentity[] | undefined
}

const schemaDeclarations = new WeakMap<
	SchemaDefinition,
	NormalizedSchemaDeclaration
>()
const compiledSchemaRecords = new WeakMap<
	SchemaDefinition,
	CompiledSchemaRecord
>()
/** Owns deferred declarations and published compilation records for one schema class. */
export const storeSchemaDeclaration = (
	schema: SchemaDefinition,
	declaration: NormalizedSchemaDeclaration,
): void => {
	schemaDeclarations.set(schema, declaration)
}

export const getSchemaDeclaration = (
	schema: SchemaDefinition,
): NormalizedSchemaDeclaration | undefined => schemaDeclarations.get(schema)

export const storeCompiledSchemaRecord = (
	schema: SchemaDefinition,
	record: CompiledSchemaRecord,
): void => {
	compiledSchemaRecords.set(schema, record)
}

export const getCompiledSchemaRecord = (
	schema: SchemaDefinition,
): CompiledSchemaRecord | undefined => compiledSchemaRecords.get(schema)

export const readCompiledSchemaRecord = (
	schema: SchemaDefinition,
): CompiledSchemaRecord => {
	const record = compiledSchemaRecords.get(schema)

	if (record === undefined) {
		throw new SchemaCompilationError(
			'not-compiled',
			schema.className,
			`Schema ${schema.className} has not been compiled by an application`,
		)
	}

	return record
}
