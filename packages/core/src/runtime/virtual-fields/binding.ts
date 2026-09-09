import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { RuntimeVirtualFieldScheduler } from './execution.js'

const applicationsByPipeline = new WeakMap<RuntimePipeline, object>()

/** Binds resolver attribution to the exact application that compiled the pipeline. */
export const bindRuntimeVirtualFields = (
	pipeline: RuntimePipeline,
	application: object,
): void => {
	const existing = applicationsByPipeline.get(pipeline)
	if (existing !== undefined && existing !== application) {
		throw new TypeError('Runtime virtual fields are already application-bound')
	}
	applicationsByPipeline.set(pipeline, application)
}

/** Preserves application identity when a transaction creates an isolated pipeline. */
export const inheritRuntimeVirtualFields = (
	source: RuntimePipeline,
	target: RuntimePipeline,
): void => {
	const application = applicationsByPipeline.get(source)
	if (application !== undefined) bindRuntimeVirtualFields(target, application)
}

/** Creates one bounded scheduler for one independently executed operation. */
export const createRuntimeVirtualFieldScheduler = (
	pipeline: RuntimePipeline,
): RuntimeVirtualFieldScheduler | undefined => {
	const application = applicationsByPipeline.get(pipeline)
	return application === undefined
		? undefined
		: new RuntimeVirtualFieldScheduler(application)
}
