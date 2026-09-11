import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { RuntimeRelationFilterResolver } from './execution.js'

type RelationFilterApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const applicationsByPipeline = new WeakMap<
	RuntimePipeline,
	RelationFilterApplication
>()

/** Binds relation resolver attribution to the application owning one pipeline. */
export const bindRuntimeRelationFilters = (
	pipeline: RuntimePipeline,
	application: RelationFilterApplication,
): void => {
	const existing = applicationsByPipeline.get(pipeline)
	if (existing !== undefined && existing !== application) {
		throw new TypeError(
			'Runtime relation filters are already application-bound',
		)
	}
	applicationsByPipeline.set(pipeline, application)
}

/** Preserves application identity in an isolated transaction pipeline. */
export const inheritRuntimeRelationFilters = (
	source: RuntimePipeline,
	target: RuntimePipeline,
): void => {
	const application = applicationsByPipeline.get(source)
	if (application !== undefined) bindRuntimeRelationFilters(target, application)
}

/** Creates one request-local declaration cache for one root Runtime operation. */
export const createRuntimeRelationFilterResolver = (
	pipeline: RuntimePipeline,
): RuntimeRelationFilterResolver | undefined => {
	const application = applicationsByPipeline.get(pipeline)
	return application === undefined
		? undefined
		: new RuntimeRelationFilterResolver(application)
}
