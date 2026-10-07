import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import type { ExecutableOperationAst } from '../../query/index.js'
import {
	type NormalizedOperationOptions,
	type OperationBatchEntry,
	type OperationBatchProjection,
} from '../../query/operations/execution.js'
import type { RequestContext } from '../context/request-context.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { readRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import { projectRuntimeMutationBatch } from '../pipeline/runtime-pipeline.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

export interface RuntimeTerminalExecution {
	readonly context: RequestContext
	readonly result: unknown
}

interface BatchTerminalExecutor {
	readonly execute: (
		operation: unknown,
		options: NormalizedOperationOptions,
	) => Promise<unknown>
	readonly executeWithRuntime: (
		operation: unknown,
		options: NormalizedOperationOptions,
	) => Promise<RuntimeTerminalExecution>
}

/** Preserves item order, private identities, and one final batch projection. */
export const executeRequestTerminalBatch = async (
	entries: readonly OperationBatchEntry[],
	options: NormalizedOperationOptions,
	projection: OperationBatchProjection | undefined,
	pipeline: RuntimePipeline,
	terminal: BatchTerminalExecutor,
): Promise<readonly unknown[]> => {
	if (entries.length === 0) return immutableArray([])

	const results: unknown[] = []
	const objectIds: string[] = []
	let projectionContext: RequestContext | undefined

	for (const entry of entries) {
		let result: unknown

		if (projection === undefined) {
			result = await terminal.execute(entry.operation, options)
		} else {
			const execution = await terminal.executeWithRuntime(
				entry.operation,
				options,
			)

			result = execution.result
			projectionContext = execution.context
		}

		if (entry.requireResult === true && result === null) {
			throw createProtectedObjectNotFoundError()
		}

		results.push(result)

		if (projection !== undefined) {
			if (!isPlainRecord(result)) {
				throw new TypeError('Mutation batch projection requires record results')
			}

			const identity = readRuntimeSchemaModelMetadata(result)?.objectId

			if (typeof identity !== 'string') {
				throw new TypeError(
					'Mutation batch result is missing its persisted object id',
				)
			}

			objectIds.push(identity)
		}
	}

	if (projection === undefined) return immutableArray(results)
	if (projectionContext === undefined) {
		throw new TypeError(
			'Mutation batch projection is missing its effective request context',
		)
	}

	const records = immutableArray(
		results.map((result) => {
			if (!isPlainRecord(result)) {
				throw new TypeError('Mutation batch projection requires record results')
			}

			return result
		}),
	)
	const projected = await projectRuntimeMutationBatch(pipeline, {
		context: projectionContext,
		objectIds: immutableArray(objectIds),
		operation: projection.operation,
		results: records,
	})

	return immutableArray(
		projected.map((result, index) => {
			const entry = entries[index]

			if (entry === undefined) {
				throw new TypeError(
					'Mutation batch projection lost its operation entry',
				)
			}

			const operation = entry.operation as ExecutableOperationAst
			const projectedOperation: ExecutableOperationAst =
				operation.kind === 'create-one'
					? immutableRecord({
							...operation,
							inclusion: projection.operation.query.inclusion,
						})
					: operation.kind === 'update-one'
						? immutableRecord({
								...operation,
								query: immutableRecord({
									...operation.query,
									inclusion: projection.operation.query.inclusion,
								}),
							})
						: operation

			return materializeOperationResult(
				projectedOperation,
				result as RuntimeOperationResult<typeof projectedOperation>,
			)
		}),
	)
}
