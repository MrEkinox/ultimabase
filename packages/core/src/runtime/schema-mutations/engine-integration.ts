import type { FrameworkEngine } from '../engine/framework-engine.js'
import { PluginSchemaMutationRuntime } from './runtime.js'

const runtimes = new WeakMap<FrameworkEngine, PluginSchemaMutationRuntime>()

/** Builds and validates every exact owner-handler pair during engine assembly. */
export const bindFrameworkSchemaMutationRuntime = (
	framework: FrameworkEngine,
): void => {
	runtimes.set(
		framework,
		new PluginSchemaMutationRuntime(framework.application),
	)
}

/** @internal Resolves only the Runtime bound to this exact application engine. */
export const getFrameworkSchemaMutationRuntime = (
	framework: FrameworkEngine,
): PluginSchemaMutationRuntime => {
	const runtime = runtimes.get(framework)
	if (runtime === undefined) {
		throw new TypeError('Framework schema mutation Runtime is unavailable')
	}
	return runtime
}
