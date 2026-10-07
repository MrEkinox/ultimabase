import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { UltimaBase } from './ultima-base.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'

type AnyUltimaBase = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[],
	PluginSourceState
>
type AnyApplicationKernel = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const applicationKernels = new WeakMap<AnyUltimaBase, AnyApplicationKernel>()
const applicationEngines = new WeakMap<AnyUltimaBase, FrameworkEngine>()

/** @internal Binds the sole public owner to its private application kernel. */
export const bindUltimaBaseKernel = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
	application: FrameworkApplication<TSchemas, TPlugins>,
): void => {
	applicationKernels.set(ultimabase, application)
}

/** @internal Publishes the assembled Runtime only to Core-owned consumers. */
export const bindUltimaBaseEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
	engine: FrameworkEngine<TSchemas, TPlugins>,
): void => {
	applicationEngines.set(ultimabase, engine)
}

/** @internal Reads the private Runtime engine after successful assembly. */
export const readUltimaBaseEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): FrameworkEngine<TSchemas, TPlugins> => {
	const engine = applicationEngines.get(ultimabase)
	if (engine === undefined) {
		throw new TypeError('UltimaBase Runtime engine is unavailable')
	}
	return engine as FrameworkEngine<TSchemas, TPlugins>
}

/** @internal Resolves private Core state without exposing another public owner. */
export const readUltimaBaseKernel = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): FrameworkApplication<TSchemas, TPlugins> => {
	const application = applicationKernels.get(ultimabase)
	if (application === undefined) {
		throw new TypeError('UltimaBase application kernel is unavailable')
	}
	return application as FrameworkApplication<TSchemas, TPlugins>
}
