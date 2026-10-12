/**
 * Plugin-author entry of UltimaBase Core (`@ultimabase/core/plugin`,
 * ADR-0311 and ADR-0316). Applications import `@ultimabase/core`; plugins,
 * transports and the plugin kit import the authoring contracts from here:
 * `plugin()`, contributions, capabilities, schema declarations, schema
 * mutations, operations, projection slots and Typegen references.
 */
export {
	decodeQueryCursor,
	encodeQueryCursor,
	type QueryCursorOrderBy,
} from './query/clauses/cursor.js'
export type { QueryPosition } from './query/query/input-contracts.js'
export { RequestCapability } from './access/request/capability.js'
export { RequestContextValue } from './access/request/context-value.js'
export type {
	RequestContextValueSnapshot,
	RequestContextValueType,
} from './access/request/context-value.js'
export {
	RequestContext,
	requestSources,
} from './runtime/context/request-context.js'
export type {
	BuiltInRequestSource,
	RequestContextOptions,
	RequestMetadata,
} from './runtime/context/request-context.js'
export { RequestEngine } from './runtime/engine/request-engine.js'
export { runAfterCommit } from './runtime/transactions/run-transaction.js'
export { waitForAfterCommitWork } from './runtime/transactions/after-commit-work.js'
export type { AfterCommitWork } from './runtime/transactions/after-commit-work.js'
export type { RequestTransactionHandler } from './runtime/engine/request-engine.js'
export {
	anonymous,
	authorizeMasterKey,
	withContext,
} from './runtime/application/plugin-authority.js'
export { WhereBuilder } from './query/filters/where.js'
export { QueryBuilder } from './query/query/query.js'
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
	PluginStartContext,
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
	PluginOperationPublicDeclaration,
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
	PluginSchemaMutationTarget,
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
	PluginFactory,
} from './plugins/definition.js'
export type { PluginSetupContext } from './plugins/setup-registries.js'
export type {
	PluginSourceFieldObjectValue,
	PluginSourceFieldApply,
	PluginSourceFieldHKT,
	PluginSourceFieldPresentValue,
	PluginSourceFieldOptionByKind,
	PluginSourceFieldValue,
	PluginSourceOpaque,
	PluginSourceRelationChange,
	PluginSourceState,
} from './plugins/source-projections.js'
export { provideSchemaShapeMethods } from './plugins/schema-extensions.js'
export { provideSchemaFactories } from './plugins/schema-factories.js'
export type {
	PluginSchemaFactoriesSource,
	SchemaFactoriesFor,
	SchemaFactoriesHKT,
	SchemaFactoryContext,
	SchemaFactoryImplementations,
	SchemaFactoryImplementationsOf,
	SchemaFactoryShape,
	SchemaFactoryShapeBrand,
} from './plugins/schema-factories.js'
export { readSchemaRules } from './plugins/schema-rule-values.js'
export type {
	DeclaredSchemaShape,
	PluginSchemaFieldsSource,
	PluginSchemaRulesSource,
	PluginSchemaShapeSource,
	PluginSchemaStaticsSource,
	SchemaFieldsFor,
	SchemaFieldsHKT,
	SchemaShapeOf,
	SchemaStaticsFor,
	SchemaStaticsHKT,
	SchemaRulesFor,
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaShapeMethodImplementation,
	SchemaShapeMethodImplementations,
} from './plugins/schema-extensions.js'
export type {
	SchemaCommands,
	SchemaPermissions,
	PluginSourceSchemaFieldValues,
	PluginSourceSchemaMutationCarrier,
	PluginSourceSchemaMutations,
	PluginSourceSchemaPermissions,
	SchemaRulesSource,
} from './plugins/source-schema-templates.js'
export {
	holdsSchemaPermission,
	provideSchemaPermissions,
	schemaPermissionsCapability,
} from './runtime/enforcement/schema-permissions.js'
export type {
	SchemaPermissionDeclaration,
	SchemaPermissionsProviderOptions,
} from './runtime/enforcement/schema-permissions.js'
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
