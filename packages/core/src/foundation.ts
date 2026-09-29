export {
	FrameworkError,
	frameworkErrorCodes,
} from './errors/framework-error.js'
export { PluginError } from './errors/plugin-error.js'
export type {
	ConfiguredPlugin,
	ConfiguredPluginExports,
	ConfiguredPluginId,
	ConfiguredPluginIdentity,
	ConfiguredPluginIdentityExports,
} from './application/configured-plugins.js'
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
export { plugin } from './plugins/plugin.js'
export type {
	PluginInstance,
	PluginInstanceContract,
	PluginOptions,
} from './plugins/plugin.js'
export {
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
} from './plugins/plugin-contributions.js'
export type {
	PluginApplicationContribution,
	PluginApplicationFactory,
	PluginApplicationResource,
	PluginContribution,
	PluginDeclarationContribution,
	PluginDeclarationContributionOptions,
	PluginDeclarationRequirements,
	PluginModelContributionContext,
	PluginOperationDeclarationContributionContext,
	PluginPrivateStorageContributionContext,
	PluginPrivilegedContribution,
	PluginSchemaContributionContext,
	PluginTypegenContributionContext,
} from './plugins/plugin-contributions.js'
export type {
	PluginPermissionReason,
	PluginPermissionReasons,
} from './plugins/plugin-permissions.js'
export {
	contributeOperation,
	contributeOperationBinding,
	contributeSchemaMutation,
	contributeSchemaMutationBinding,
} from './plugins/plugin-command-contributions.js'
export type {
	DirectPluginOperationContributionOptions,
	DirectPluginSchemaMutationContributionOptions,
	PluginOperationAuthoringContribution,
	PluginOperationBindingContribution,
	PluginOperationContribution,
	PluginOperationContributionOptions,
	PluginOperationHandlerResource,
	PluginSchemaMutationAuthoringContribution,
	PluginSchemaMutationBindingContribution,
	PluginSchemaMutationContribution,
	PluginSchemaMutationContributionOptions,
	PluginSchemaMutationResource,
	ResourcePluginOperationContributionOptions,
	ResourcePluginSchemaMutationContributionOptions,
} from './plugins/plugin-command-contribution-contracts.js'
export {
	defineOperation,
	defineOperationValue,
	isPluginOperationDefinition,
} from './plugins/plugin-operations.js'
export {
	defineSchemaMutation,
	isPluginSchemaMutationDefinition,
} from './plugins/plugin-schema-mutations.js'
export type {
	CompiledPluginSchemaMutationDefinition,
	DefinePluginSchemaMutationOptions,
	PluginSchemaMutationAuthority,
	PluginSchemaMutationDefinition,
	PluginSchemaMutationDependencySelection,
	PluginSchemaMutationEffect,
	PluginSchemaMutationErrorCode,
	PluginSchemaMutationInput,
	PluginSchemaMutationNoInput,
	PluginSchemaMutationReturning,
} from './plugins/plugin-schema-mutations.js'
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
export type {
	PluginModelSurfaceRegistrar,
	PluginOperationDeclarationRegistrar,
	PluginSchemaMutationSurface,
	PluginSchemaMutationSurfaceBinding,
} from './plugins/application-surface-declarations.js'
export {
	defineCapability,
	optionalCapability,
	provideCapability,
	requireCapability,
} from './plugins/capabilities.js'
export type {
	ApplicationCapabilityFactory,
	ApplicationCapabilityFactoryContext,
	ApplicationCapabilityResource,
	CapabilityCardinality,
	CapabilityComposer,
	CapabilityCompositionInput,
	CapabilityConsumerValue,
	CapabilityLifetime,
	CapabilityProviderDeclaration,
	CapabilityProviderContribution,
	CapabilityProviderValue,
	CapabilityRequirement,
	CapabilityToken,
	DefineCapabilityFactory,
	DefineCapabilityOptions,
	PluginCapabilityDeclarationOptions,
	PluginCapabilityDeclaration,
	PluginCapabilityDeclarations,
	PluginCapabilityReader,
} from './plugins/capabilities.js'
export type { ApplicationCallbackExecutor } from './plugins/callback-execution.js'
export { defineDatabaseConstraintCompiler } from './plugins/constraint-compilers.js'
export type {
	DatabaseConstraintCompilerContribution,
	DatabaseConstraintCompilerDefinition,
	DatabaseConstraintCompilerReader,
	DefineDatabaseConstraintCompilerOptions,
	PluginConstraintCompilerRegistry,
} from './plugins/constraint-compilers.js'
export type {
	FrameworkPlugin,
	FrameworkPluginContract,
	PluginDefinition,
	PluginExports,
	PluginSetupContext,
} from './plugins/definition.js'
export type { PluginSourceFieldValue } from './plugins/source-projections.js'
export type {
	PluginDeclaration,
	PluginDeclarationCapabilityReader,
	PluginDeclarationContext,
} from './plugins/declaration-host.js'
export {
	defineTypegenReference,
	isTypegenReference,
} from './plugins/typegen-contracts.js'
export type { TypegenReference } from './plugins/typegen-contracts.js'
export type {
	CompiledTypegenGraph,
	CompiledTypegenOption,
	OwnedTypegenReference,
	TypegenDeclarations,
	TypegenReferenceRegistrar,
} from './plugins/typegen-declarations.js'
export {
	addSchemaConstraint,
	addSchemaField,
	addSchemaIndex,
	defineFieldOption,
	defineSchemaOption,
	setSchemaFieldOption,
	setSchemaOption,
} from './plugins/schema-declarations.js'
export type {
	AddSchemaConstraintOperation,
	AddSchemaFieldOperation,
	AddSchemaFieldOptions,
	AddSchemaIndexOperation,
	FieldOptionDefinition,
	PluginSchemaDeclarationRegistrar,
	SetSchemaFieldOptionOperation,
	SetSchemaOptionOperation,
	SchemaOptionDefinition,
	SchemaOptionAbsenceSelector,
	SchemaOptionEqualitySelector,
	SchemaOptionPresenceSelector,
	SchemaOptionRuntimeCompilationContext,
	SchemaOptionRuntimeCompiler,
	SchemaOptionSelector,
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
	pluginEnvironmentClaimMetadata,
	pluginEnvironmentClaims,
	pluginPrivilegeMetadata,
} from './plugins/manifest.js'
export type {
	PluginEnvironmentClaim,
	PluginEnvironmentClaimMetadata,
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
