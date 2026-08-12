export {
	FrameworkError,
	frameworkErrorCodes,
} from './errors/framework-error.js'
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
export type {
	FrameworkAccessDefaultPolicy,
	FrameworkAccessOptions,
	FrameworkApplicationOptions,
} from './application/framework-application.js'
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
export { definePlugin } from './plugins/definition.js'
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
export { defineFieldKindHookTarget } from './plugins/hook-targets.js'
export { defineFieldKindAccessTarget } from './plugins/access-targets.js'
export type {
	FieldExtensionAccessFactory,
	FieldExtensionAccessTargetContext,
	FieldKindAccessFactory,
	FieldKindAccessTarget,
	FieldKindAccessTargetContext,
	PluginAccessContributionOptions,
	PluginAccessMasterBehavior,
	PluginAccessRegistry,
	PluginAccessTargetKind,
	SchemaExtensionAccessFactory,
	SchemaExtensionAccessTargetContext,
} from './plugins/access-targets.js'
export type {
	FieldExtensionHookFactory,
	FieldExtensionHookTargetContext,
	FieldKindHookFactory,
	FieldKindHookTarget,
	FieldKindHookTargetContext,
	PluginHookRegistry,
	PluginHookTargetKind,
	SchemaExtensionHookFactory,
	SchemaExtensionHookTargetContext,
} from './plugins/hook-targets.js'
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
	isSchemaCompilerArtifactReference,
	schemaCompilerProtocolVersion,
} from './plugins/schema-compiler-ir/index.js'
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
export type {
	PluginEventContributionHost,
	PluginRuntimeContributionHost,
	PluginRuntimePipelineHost,
} from './plugins/runtime-contribution-hosts.js'
