export {
	addSchemaConstraint,
	removeSchemaConstraint,
	replaceSchemaConstraint,
} from './schema-artifact-patch-operations.js'

export { attachPluginDeclarationDiagnostic } from './schema-declaration-contracts.js'

export type {
	PluginDeclarationFailureDiagnostic,
	PluginSchemaDeclarationRegistrar,
} from './schema-declaration-contracts.js'

export { SchemaDeclarationRegistry } from './schema-declaration-registry.js'

export {
	addSchemaField,
	addSchemaIndex,
	removeSchemaField,
	removeSchemaFieldOption,
	removeSchemaIndex,
	removeSchemaOption,
	renameSchemaField,
	replaceSchemaField,
	replaceSchemaIndex,
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
	SchemaOptionTypegenDescriptor,
} from './schema-option-definitions.js'

export type {
	AddSchemaConstraintOperation,
	AddSchemaFieldOperation,
	AddSchemaIndexOperation,
	ExistingSchemaContributionTarget,
	RemoveSchemaConstraintOperation,
	RemoveSchemaFieldOperation,
	RemoveSchemaFieldOptionOperation,
	RemoveSchemaIndexOperation,
	RemoveSchemaOptionOperation,
	RenameSchemaFieldOperation,
	ReplaceSchemaConstraintOperation,
	ReplaceSchemaFieldOperation,
	ReplaceSchemaIndexOperation,
	SchemaPatchOperation,
	SchemaOptionAbsenceSelector,
	SchemaOptionEqualitySelector,
	SchemaOptionPresenceSelector,
	SchemaOptionSelector,
	SchemaSelection,
	SchemaSelectorOptions,
	SetSchemaFieldOptionOperation,
	SetSchemaOptionOperation,
} from './schema-patch-contracts.js'
