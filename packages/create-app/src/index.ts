// Keep programmatic selection and catalog access free of CLI side effects.
export {
	officialPlugins,
	pluginGroups,
	type ApiId,
	type PluginId,
} from './catalog.js'
export {
	detectPackageManager,
	parseOptions,
	resolveSelection,
	type InitializerPlan,
	type ParsedOptions,
	type SelectionInput,
} from './config.js'
export {
	nextCommands,
	renderBaseFiles,
	type ProjectFiles,
} from './base-template.js'
export { createProject, type ProjectGenerationOptions } from './generate.js'
