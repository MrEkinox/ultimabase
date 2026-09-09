export { isSchemaCompilerArtifactReference } from './artifacts.js'

export { schemaCompilerProtocolVersion } from './contracts.js'

export type {
	SchemaCompilerAddConstraintOperation,
	SchemaCompilerAddFieldOperation,
	SchemaCompilerAddIndexOperation,
	SchemaCompilerArtifactKind,
	SchemaCompilerArtifactReference,
	SchemaCompilerConstraintNode,
	SchemaCompilerContributionTarget,
	SchemaCompilerFieldNode,
	SchemaCompilerIndexNode,
	SchemaCompilerInput,
	SchemaCompilerOptionDefinitionNode,
	SchemaCompilerOptionNode,
	SchemaCompilerOptionValue,
	SchemaCompilerOutputNode,
	SchemaCompilerOutput,
	SchemaCompilerPatchNode,
	SchemaCompilerPatchOperation,
	SchemaCompilerPluginDeclarationNode,
	SchemaCompilerRemoveConstraintOperation,
	SchemaCompilerRemoveFieldOperation,
	SchemaCompilerRemoveFieldOptionOperation,
	SchemaCompilerRemoveIndexOperation,
	SchemaCompilerRemoveSchemaOptionOperation,
	SchemaCompilerRenameFieldOperation,
	SchemaCompilerReplaceConstraintOperation,
	SchemaCompilerReplaceFieldOperation,
	SchemaCompilerReplaceIndexOperation,
	SchemaCompilerSchemaAdditionNode,
	SchemaCompilerSchemaNode,
	SchemaCompilerSelectionNode,
	SchemaCompilerSelectionResultNode,
	SchemaCompilerSetFieldOptionOperation,
	SchemaCompilerSetSchemaOptionOperation,
	SchemaCompilerVirtualFieldNode,
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
