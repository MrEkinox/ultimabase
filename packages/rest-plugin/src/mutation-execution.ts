import type {
	ApplicationRequestExecutor,
	ApplicationSchemaMutationResult,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'

import {
	normalizeRestMutationRequest,
	type RestMutationCommand,
	type RestMutationRequest,
} from './mutations.js'
import type { RestReadLimits } from './reads.js'

/** Executes one REST mutation through Core's schema-command request boundary. */
export const executeRestMutationRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestMutationRequest,
>(
	executor: ApplicationRequestExecutor,
	context: RequestContext,
	schema: TSchema,
	input: TInput,
	limits?: RestReadLimits,
): Promise<
	ApplicationSchemaMutationResult<
		RestMutationCommand<TSchema, TInput['operation']>
	>
> => {
	const request = await normalizeRestMutationRequest(schema, input, limits)
	return executor.executeMutation(context, schema, request)
}
