import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import type { RuntimePipeline } from './runtime-pipeline.js'

type RelationFilterApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

/**
 * Attributes one pipeline to the exact application that compiled it. A pipeline
 * may be bound again only to the same application; transaction pipelines
 * inherit the binding of their source pipeline.
 */
const createPipelineApplicationBinding = <TApplication extends object, TValue>(
	alreadyBoundMessage: string,
	create: (application: TApplication) => TValue,
) => {
	const applicationsByPipeline = new WeakMap<RuntimePipeline, TApplication>()
	const bind = (pipeline: RuntimePipeline, application: TApplication): void => {
		const existing = applicationsByPipeline.get(pipeline)
		if (existing !== undefined && existing !== application) {
			throw new TypeError(alreadyBoundMessage)
		}
		applicationsByPipeline.set(pipeline, application)
	}

	return {
		bind,
		create: (pipeline: RuntimePipeline): TValue | undefined => {
			const application = applicationsByPipeline.get(pipeline)
			return application === undefined ? undefined : create(application)
		},
		inherit: (source: RuntimePipeline, target: RuntimePipeline): void => {
			const application = applicationsByPipeline.get(source)
			if (application !== undefined) bind(target, application)
		},
	}
}

const virtualFields = createPipelineApplicationBinding(
	'Runtime virtual fields are already application-bound',
	(application: object) => new RuntimeVirtualFieldScheduler(application),
)

const relationFilters = createPipelineApplicationBinding(
	'Runtime relation filters are already application-bound',
	(application: RelationFilterApplication) =>
		new RuntimeRelationFilterResolver(application),
)

/** Binds virtual resolver attribution to the application that compiled the pipeline. */
export const bindRuntimeVirtualFields: (
	pipeline: RuntimePipeline,
	application: object,
) => void = virtualFields.bind

/** Preserves application identity when a transaction creates an isolated pipeline. */
export const inheritRuntimeVirtualFields: (
	source: RuntimePipeline,
	target: RuntimePipeline,
) => void = virtualFields.inherit

/** Creates one bounded scheduler for one independently executed operation. */
export const createRuntimeVirtualFieldScheduler: (
	pipeline: RuntimePipeline,
) => RuntimeVirtualFieldScheduler | undefined = virtualFields.create

/** Binds relation resolver attribution to the application owning one pipeline. */
export const bindRuntimeRelationFilters: (
	pipeline: RuntimePipeline,
	application: RelationFilterApplication,
) => void = relationFilters.bind

/** Preserves application identity in an isolated transaction pipeline. */
export const inheritRuntimeRelationFilters: (
	source: RuntimePipeline,
	target: RuntimePipeline,
) => void = relationFilters.inherit

/** Creates one request-local declaration cache for one root Runtime operation. */
export const createRuntimeRelationFilterResolver: (
	pipeline: RuntimePipeline,
) => RuntimeRelationFilterResolver | undefined = relationFilters.create
