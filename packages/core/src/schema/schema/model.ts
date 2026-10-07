export {
	createSchemaModelCapabilityContext,
	finalizeSchemaModelClass,
} from './model-capabilities.js'
export { createSchemaModelClass } from './model-class.js'
export {
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from './model-materialization.js'
export { isSchemaModelInstance } from './model-state.js'
export type {
	CompactSchemaModelUpdateInput,
	PersistedSchemaModel,
	PersistedSchemaReference,
	SchemaDraft,
	SchemaDraftCommands,
	SchemaDraftUpsertFields,
	SchemaDraftUpsertInput,
	SchemaModelCapabilityContext,
	SchemaModelCreateInput,
	SchemaModelDefinitionReader,
	SchemaModelDeleteInput,
	SchemaModelFetchInput,
	SchemaModelMaterialization,
	SchemaModelSelection,
	SchemaModelUpdateCommandInput,
	SchemaModelUpdateInput,
	SchemaPreparedDraft,
	SchemaResult,
	SchemaResultCapabilitiesOf,
	SchemaResultCapabilityCarrier,
	SchemaResultCommands,
	SchemaResultRelations,
} from './model-contracts.js'
