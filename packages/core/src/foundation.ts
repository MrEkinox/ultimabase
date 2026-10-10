export {
	FrameworkError,
	frameworkErrorCodes,
} from './errors/framework-error.js'
export { PluginError } from './errors/plugin-error.js'
export { PublicError } from './errors/public-error.js'
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
export type {
	DefaultPublicErrorCode,
	PublicErrorOptions,
	PublicErrorPayload,
} from './errors/public-error.js'
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
	PluginDeclarationSource,
	PluginModelContributionContext,
	PluginOperationDeclarationContributionContext,
	PluginPrivateStorageContributionContext,
	PluginPrivilegedContribution,
	PluginSchemaContributionContext,
	PluginTypegenContributionContext,
} from './plugins/plugin-contributions.js'
export type { PluginPermissionReasons } from './plugins/plugin-permissions.js'
export {
	contributeOperation,
	contributeOperationBinding,
	contributeSchemaMutation,
} from './plugins/plugin-command-contributions.js'
export type {
	DirectPluginOperationContributionOptions,
	DirectPluginSchemaMutationContributionOptions,
	PluginOperationAuthoringContribution,
	PluginOperationBindingContribution,
	PluginOperationContribution,
	PluginOperationContributionOptions,
	PluginOperationHandlerResource,
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
	PluginModelSurfaceSource,
	PluginOperationDeclarationRegistrar,
} from './plugins/application-surface-declarations.js'
export type {
	PluginSchemaMutationSurface,
	PluginSchemaMutationSurfaceBinding,
} from './plugins/schema-mutation-surface-declarations.js'
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
export type {
	FrameworkPlugin,
	FrameworkPluginContract,
	PluginDefinition,
	PluginExports,
} from './plugins/definition.js'
export type { PluginSetupContext } from './plugins/setup-registries.js'
export type {
	PluginSourceFieldObjectValue,
	PluginSourceFieldOptionByKind,
	PluginSourceFieldValue,
	PluginSourceOpaque,
	PluginSourceRelationChange,
	PluginSourceState,
} from './plugins/source-projections.js'
export { provideSchemaShapeMethods } from './plugins/schema-extensions.js'
export type {
	PluginSchemaRulesSource,
	PluginSchemaShapeSource,
	SchemaRulesFor,
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaShapeMethodImplementation,
	SchemaShapeMethodImplementations,
} from './plugins/schema-extensions.js'
export type {
	PluginSourceSchemaFieldValues,
	PluginSourceSchemaMutationCarrier,
	PluginSourceSchemaMutations,
} from './plugins/source-schema-templates.js'
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
	addSchemaField,
	addSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
} from './plugins/schema-field-patch-operations.js'
export {
	defineFieldOption,
	defineSchemaOption,
} from './plugins/schema-option-definitions.js'
export type {
	PluginSchemaDeclarationRegistrar,
	PluginSchemaOptionSource,
	PluginSchemaPatchSource,
} from './plugins/schema-declaration-contracts.js'
export type {
	FieldOptionDefinition,
	SchemaOptionDefinition,
	SchemaOptionRuntimeCompilationContext,
	SchemaOptionRuntimeCompiler,
	SchemaOptionRuntimeRequirement,
	SchemaOptionTypegenDescriptor,
} from './plugins/schema-option-definitions.js'
export type {
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
} from './plugins/schema-patch-contracts.js'
export { normalizePlugins } from './plugins/normalization.js'
export type { NormalizedPlugin } from './plugins/normalization.js'
export { PluginGraph } from './plugins/graph.js'
export {
	formatPluginIdentity,
	isSamePluginIdentity,
} from './plugins/manifest.js'
export type {
	PluginEnvironmentClaim,
	PluginDependency,
	PluginIdentity,
	PluginManifest,
	PluginPrivilege,
	PluginPrivilegeRequest,
	PluginPrivilegeSeverity,
} from './plugins/manifest.js'
export type { PluginLifecycleState } from './plugins/lifecycle-manager.js'
