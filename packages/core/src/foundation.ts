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
	ConfiguredPluginName,
	FrameworkAccessDefaultPolicy,
	FrameworkAccessOptions,
	FrameworkApplicationOptions,
} from './application/framework-application.js'
export type {
	FrameworkErrorCode,
	FrameworkErrorDetails,
	FrameworkErrorOptions,
	FrameworkErrorPayload,
} from './errors/framework-error.js'
export { createServiceToken } from './services/service-token.js'
export type { ServiceToken } from './services/service-token.js'
export type {
	PluginServiceRegistry,
	RequiredPluginService,
} from './services/service-registry.js'
export { ServiceRegistry } from './services/service-registry.js'
export { definePlugin } from './plugins/definition.js'
export { defineDatabaseConstraintCompiler } from './plugins/constraint-compilers.js'
export type {
	DatabaseConstraintCompilerContribution,
	DatabaseConstraintCompilerDefinition,
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
export { normalizePlugins } from './plugins/normalization.js'
export type { NormalizedPlugin } from './plugins/normalization.js'
export { PluginGraph } from './plugins/graph.js'
export { extensionHandlerKey } from './plugins/extension-handlers.js'
export type { ExtensionHandlerKey } from './plugins/extension-handlers.js'
export { PluginLifecycleManager } from './plugins/lifecycle-manager.js'
export type { PluginLifecycleState } from './plugins/lifecycle-manager.js'
export {
	ContributionRegistry,
	PluginSetupRegistries,
} from './plugins/setup-registries.js'
export type {
	PluginContribution,
	PluginContributionCategory,
	PluginContributionRegistries,
	PluginContributionRegistry,
} from './plugins/setup-registries.js'
