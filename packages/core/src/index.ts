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
export { ServiceRegistry } from './services/service-registry.js'
export type { PluginServiceRegistry } from './services/service-registry.js'
export { definePlugin } from './plugins/definition.js'
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
	PluginContributionRegistries,
	PluginContributionRegistry,
} from './plugins/setup-registries.js'
