import type {
	ApplicationRequestExecutor,
	OperationResult,
	RequestContext,
	SchemaDefinition,
} from '@ultimabase/core'

import {
	normalizeRestReadRequest,
	type RestReadLimits,
	type RestReadOperationAst,
	type RestReadRequest,
} from './reads.js'

/**
 * Executes one REST read through Core while leaving response encoding to the caller.
 *
 * @example
 * `await executeRestReadRequest(executor, context, Post, { operation: 'find', request })`
 */
export const executeRestReadRequest = async <
	const TSchema extends SchemaDefinition,
	const TInput extends RestReadRequest,
>(
	executor: ApplicationRequestExecutor,
	context: RequestContext,
	schema: TSchema,
	input: TInput,
	limits?: RestReadLimits,
): Promise<
	OperationResult<RestReadOperationAst<TSchema, TInput['operation']>>
> => {
	const operation = await normalizeRestReadRequest(schema, input, limits)
	return executor.executeRead(context, operation)
}
