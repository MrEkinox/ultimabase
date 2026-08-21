export {
	addSchemaConstraint,
	addSchemaExtension,
	removeSchemaConstraint,
	removeSchemaExtension,
	replaceSchemaConstraint,
	replaceSchemaExtension,
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

export { defineSchemaOption } from './schema-option-definitions.js'

export type {
	SchemaOptionDefinition,
	SchemaOptionRuntimeCompilationContext,
	SchemaOptionRuntimeCompiler,
	SchemaOptionTypegenDescriptor,
} from './schema-option-definitions.js'

export type {
	AddSchemaConstraintOperation,
	AddSchemaExtensionOperation,
	AddSchemaFieldOperation,
	AddSchemaIndexOperation,
	ExistingSchemaContributionTarget,
	RemoveSchemaConstraintOperation,
	RemoveSchemaExtensionOperation,
	RemoveSchemaFieldOperation,
	RemoveSchemaFieldOptionOperation,
	RemoveSchemaIndexOperation,
	RemoveSchemaOptionOperation,
	RenameSchemaFieldOperation,
	ReplaceSchemaConstraintOperation,
	ReplaceSchemaExtensionOperation,
	ReplaceSchemaFieldOperation,
	ReplaceSchemaIndexOperation,
	SchemaPatchOperation,
	SchemaOptionEqualitySelector,
	SchemaOptionPresenceSelector,
	SchemaOptionSelector,
	SchemaSelection,
	SchemaSelectorOptions,
	SetSchemaFieldOptionOperation,
	SetSchemaOptionOperation,
} from './schema-patch-contracts.js'
