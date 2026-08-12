export { isSchemaCompilerArtifactReference } from './artifacts.js'

export { schemaCompilerProtocolVersion } from './contracts.js'

export type {
	SchemaCompilerAddConstraintOperation,
	SchemaCompilerAddExtensionOperation,
	SchemaCompilerAddFieldOperation,
	SchemaCompilerAddIndexOperation,
	SchemaCompilerArtifactKind,
	SchemaCompilerArtifactReference,
	SchemaCompilerConstraintNode,
	SchemaCompilerContributionTarget,
	SchemaCompilerExtensionNode,
	SchemaCompilerFieldNode,
	SchemaCompilerIndexNode,
	SchemaCompilerInput,
	SchemaCompilerOptionDefinitionNode,
	SchemaCompilerOptionNode,
	SchemaCompilerOptionValue,
	SchemaCompilerOutput,
	SchemaCompilerPatchNode,
	SchemaCompilerPatchOperation,
	SchemaCompilerPluginDeclarationNode,
	SchemaCompilerRemoveConstraintOperation,
	SchemaCompilerRemoveExtensionOperation,
	SchemaCompilerRemoveFieldOperation,
	SchemaCompilerRemoveFieldOptionOperation,
	SchemaCompilerRemoveIndexOperation,
	SchemaCompilerRemoveSchemaOptionOperation,
	SchemaCompilerRenameFieldOperation,
	SchemaCompilerReplaceConstraintOperation,
	SchemaCompilerReplaceExtensionOperation,
	SchemaCompilerReplaceFieldOperation,
	SchemaCompilerReplaceIndexOperation,
	SchemaCompilerSchemaAdditionNode,
	SchemaCompilerSchemaNode,
	SchemaCompilerSelectionNode,
	SchemaCompilerSelectionResultNode,
	SchemaCompilerSetFieldOptionOperation,
	SchemaCompilerSetSchemaOptionOperation,
} from './contracts.js'

export {
	assertSchemaCompilerInput,
	assertSchemaCompilerOutput,
} from './validation.js'

export { SchemaCompilerArtifactSession } from './artifacts.js'

export {
	canonicalSchemaCompilerTarget,
	replaceSchemaCompiler,
	schemaCompilerCapability,
} from './schema-compiler-capability.js'

export type {
	ReplaceSchemaCompilerOptions,
	SchemaCompilerImplementation,
	SchemaCompilerProvenance,
	SchemaCompilerProviderDescriptor,
} from './schema-compiler-capability.js'
