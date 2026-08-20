export {
	FrameworkError,
	frameworkErrorCodes,
} from './errors/framework-error.js'
export { PluginError } from './errors/plugin-error.js'
export {
	createApplication,
	FrameworkApplication,
} from './application/framework-application.js'
export type {
	ConfiguredPlugin,
	ConfiguredPluginExports,
	ConfiguredPluginId,
	ConfiguredPluginIdentity,
	ConfiguredPluginIdentityExports,
} from './application/configured-plugins.js'
export type { FrameworkApplicationOptions } from './application/framework-application.js'
export type {
	PluginEnvironmentClaimReport,
	PluginPrivilegeLogger,
	PluginPrivilegePluginPolicy,
	PluginPrivilegePluginReport,
	PluginPrivilegePolicy,
	PluginPrivilegePolicyScope,
	PluginPrivilegeReport,
	PluginPrivilegeRequestReport,
} from './application/plugin-privilege-policy.js'
export type {
	FrameworkErrorCode,
	FrameworkErrorDetails,
	FrameworkErrorOptions,
	FrameworkErrorPayload,
} from './errors/framework-error.js'
export type { PluginErrorPayload } from './errors/plugin-error.js'
export { definePlugin } from './plugins/definition.js'
export {
	defineOperation,
	defineOperationValue,
	isPluginOperationDefinition,
} from './plugins/plugin-operations.js'
export type {
	DefinePluginOperationOptions,
	PluginOperationDefinition,
	PluginOperationErrorCode,
	PluginOperationInput,
	PluginOperationResult,
	PluginOperationTarget,
	PluginOperationTransaction,
	PluginOperationValueContract,
} from './plugins/plugin-operations.js'
export { defineQueryExtension } from './plugins/application-surface-declarations.js'
export type {
	DefineQueryExtensionOptions,
	PluginModelSurfaceRegistrar,
	PluginOperationDeclarationRegistrar,
	PluginQuerySurfaceRegistrar,
	QueryExtensionDefinition,
	QueryExtensionInput,
} from './plugins/application-surface-declarations.js'
export {
	decorateCapability,
	defineCapability,
	optionalCapability,
	provideCapability,
	replaceCapability,
	requireCapability,
	typegenEmitterCapability,
} from './plugins/capabilities.js'
export type {
	ApplicationCapabilityFactory,
	ApplicationCapabilityFactoryContext,
	ApplicationCapabilityResource,
	CapabilityCardinality,
	CapabilityComposer,
	CapabilityCompositionInput,
	CapabilityContributionTarget,
	CapabilityConsumerValue,
	CapabilityDecoratorDeclaration,
	CapabilityLifetime,
	CapabilityProviderDeclaration,
	CapabilityProviderContribution,
	CapabilityProviderValue,
	CapabilityReplacementDeclaration,
	CapabilityRequirement,
	CapabilityToken,
	DefineCapabilityFactory,
	DefineCapabilityOptions,
	PluginCapabilityDeclarationOptions,
	PluginCapabilityDeclarations,
	PluginCapabilityReader,
	TypegenEmitterCapability,
} from './plugins/capabilities.js'
export type { ApplicationCallbackExecutor } from './plugins/callback-execution.js'
export { CapabilityInventory } from './plugins/capability-inventory.js'
export type {
	CapabilityInventoryEntry,
	CapabilityDecoratorInspection,
	CapabilityProviderChainInspection,
	CapabilityProviderInspection,
	CapabilityRequirementInspection,
} from './plugins/capability-inventory.js'
export { defineDatabaseConstraintCompiler } from './plugins/constraint-compilers.js'
export type {
	DatabaseConstraintCompilerContribution,
	DatabaseConstraintCompilerDefinition,
	DatabaseConstraintCompilerReader,
	DefineDatabaseConstraintCompilerOptions,
	PluginConstraintCompilerRegistry,
} from './plugins/constraint-compilers.js'
export type {
	DefinePluginOptions,
	FrameworkPlugin,
	PluginDefinition,
	PluginExports,
	PluginLifecycleContext,
	PluginLifecycleHook,
	PluginLifecycleHooks,
	PluginLifecyclePhase,
	PluginSetup,
	PluginSetupContext,
	PluginSetupExports,
} from './plugins/definition.js'
export type {
	PluginDeclaration,
	PluginDeclarationCapabilityReader,
	PluginDeclarationContext,
} from './plugins/declaration-host.js'
export {
	defineTypegenReference,
	isTypegenReference,
} from './plugins/typegen-contracts.js'
export type {
	TypegenNamedDeclaration,
	TypegenOutputDeclaration,
	TypegenOutputDeclarationOptions,
	TypegenOutputMetadata,
	TypegenPropertyNode,
	TypegenReference,
	TypegenSchemaAugmentation,
	TypegenStructuredContribution,
	TypegenTypeNode,
} from './plugins/typegen-contracts.js'
export type {
	CompiledTypegenGraph,
	CompiledTypegenOption,
	OwnedTypegenContribution,
	OwnedTypegenOutput,
	OwnedTypegenReference,
	TypegenContributionRegistrar,
	TypegenDeclarations,
	TypegenOutputRegistrar,
	TypegenReferenceRegistrar,
} from './plugins/typegen-declarations.js'
export {
	isSchemaCompilerArtifactReference,
	canonicalSchemaCompilerTarget,
	replaceSchemaCompiler,
	schemaCompilerCapability,
	schemaCompilerProtocolVersion,
} from './plugins/schema-compiler-ir/index.js'
export type {
	ReplaceSchemaCompilerOptions,
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
	SchemaCompilerImplementation,
	SchemaCompilerProvenance,
	SchemaCompilerProviderDescriptor,
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
} from './plugins/schema-compiler-ir/index.js'
export {
	addSchemaConstraint,
	addSchemaField,
	addSchemaExtension,
	addSchemaIndex,
	defineSchemaOption,
	removeSchemaConstraint,
	removeSchemaField,
	removeSchemaExtension,
	removeSchemaFieldOption,
	removeSchemaIndex,
	removeSchemaOption,
	renameSchemaField,
	replaceSchemaField,
	replaceSchemaConstraint,
	replaceSchemaExtension,
	replaceSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
} from './plugins/schema-declarations.js'
export type {
	AddSchemaConstraintOperation,
	AddSchemaFieldOperation,
	AddSchemaExtensionOperation,
	AddSchemaIndexOperation,
	ExistingSchemaContributionTarget,
	PluginSchemaDeclarationRegistrar,
	RemoveSchemaConstraintOperation,
	RemoveSchemaFieldOperation,
	RemoveSchemaExtensionOperation,
	RemoveSchemaFieldOptionOperation,
	RemoveSchemaIndexOperation,
	RemoveSchemaOptionOperation,
	RenameSchemaFieldOperation,
	ReplaceSchemaConstraintOperation,
	ReplaceSchemaFieldOperation,
	ReplaceSchemaExtensionOperation,
	ReplaceSchemaIndexOperation,
	SetSchemaFieldOptionOperation,
	SetSchemaOptionOperation,
	SchemaOptionDefinition,
	SchemaOptionRuntimeCompilationContext,
	SchemaOptionRuntimeCompiler,
	SchemaOptionTypegenDescriptor,
	SchemaPatchOperation,
	SchemaSelection,
	SchemaSelectorOptions,
} from './plugins/schema-declarations.js'
export { normalizePlugins } from './plugins/normalization.js'
export type { NormalizedPlugin } from './plugins/normalization.js'
export { PluginGraph } from './plugins/graph.js'
export {
	formatPluginIdentity,
	isSamePluginIdentity,
	pluginEnvironmentClaims,
	pluginPrivilegeMetadata,
} from './plugins/manifest.js'
export type {
	PluginEnvironmentClaim,
	PluginDependency,
	PluginIdentity,
	PluginManifest,
	PluginPrivilege,
	PluginPrivilegeFacade,
	PluginPrivilegeMetadata,
	PluginPrivilegeRequest,
	PluginPrivilegeSeverity,
} from './plugins/manifest.js'
export type { PluginLifecycleState } from './plugins/lifecycle-manager.js'
