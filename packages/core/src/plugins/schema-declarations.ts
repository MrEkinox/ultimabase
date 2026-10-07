export { attachPluginDeclarationDiagnostic } from './schema-declaration-contracts.js'

export type {
	PluginDeclarationFailureDiagnostic,
	PluginSchemaDeclarationRegistrar,
	PluginSchemaOptionSource,
	PluginSchemaPatchSource,
} from './schema-declaration-contracts.js'

export { SchemaDeclarationRegistry } from './schema-declaration-registry.js'

export {
	addSchemaConstraint,
	addSchemaField,
	addSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
} from './schema-field-patch-operations.js'

export {
	defineFieldOption,
	defineSchemaOption,
} from './schema-option-definitions.js'

export type {
	FieldOptionDefinition,
	SchemaOptionDefinition,
	SchemaOptionRuntimeCompilationContext,
	SchemaOptionRuntimeCompiler,
	SchemaOptionRuntimeRequirement,
	SchemaOptionTypegenDescriptor,
} from './schema-option-definitions.js'

export type {
	AddSchemaConstraintOperation,
	AddSchemaFieldOperation,
	AddSchemaFieldOptions,
	AddSchemaIndexOperation,
	SchemaOptionAbsenceSelector,
	SchemaOptionEqualitySelector,
	SchemaOptionPresenceSelector,
	SchemaOptionSelector,
	SchemaPatchOperation,
	SchemaSelection,
	SchemaSelectorOptions,
	SetSchemaFieldOptionOperation,
	SetSchemaOptionOperation,
} from './schema-patch-contracts.js'
