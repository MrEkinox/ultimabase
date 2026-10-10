import { createRuntimeRelationFilterResolver } from '../pipeline/application-bindings.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { evaluatePolicyQuery, type PolicyQueryRequest } from './policy-query.js'

const evaluators = new WeakMap<
	RuntimePipeline,
	(request: PolicyQueryRequest) => Promise<boolean>
>()

/** @internal Lets `can()` reach one pipeline's policies without widening its API. */
export const bindRuntimePolicyQuery = (
	pipeline: RuntimePipeline,
	stages: Readonly<RuntimePipelineStages>,
): void => {
	evaluators.set(pipeline, (request) =>
		evaluatePolicyQuery(
			stages,
			createRuntimeRelationFilterResolver(pipeline),
			request,
		),
	)
}

/** Decides one `can()` question with one pipeline's policies (ADR-0305). */
export const evaluateRuntimePolicyQuery = (
	pipeline: RuntimePipeline,
	request: PolicyQueryRequest,
): Promise<boolean> => {
	const evaluate = evaluators.get(pipeline)
	if (evaluate === undefined) {
		throw new TypeError('Runtime policy queries are unavailable')
	}
	return evaluate(request)
}
