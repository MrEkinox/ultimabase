import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import type { ExecutableOperationAst } from '../../query/index.js'
import type {
	OperationBatchEntry,
	OperationBatchProjection,
} from '../../query/operations/execution.js'
import type { RequestContext } from '../context/request-context.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { readRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import {
	projectRuntimeMutationBatch,
	type RuntimePipeline,
} from '../pipeline/runtime-pipeline.js'

/** Retains one item's unmaterialized result and its effective request context. */
export interface RuntimeTerminalExecution {
	readonly context: RequestContext
	readonly result: unknown
}

interface BatchTerminalExecutor {
	execute(operation: unknown): Promise<unknown>
	executeWithRuntime(operation: unknown): Promise<RuntimeTerminalExecution>
}

/** Re-attaches the shared projection inclusion to one item's result operation. */
const projectOperation = (
	operation: ExecutableOperationAst,
	projection: OperationBatchProjection,
): ExecutableOperationAst => {
	const inclusion = projection.operation.query.inclusion
	if (operation.kind === 'create-one') {
		return immutableRecord({ ...operation, inclusion })
	}
	if (operation.kind === 'update-one') {
		return immutableRecord({
			...operation,
			query: immutableRecord({ ...operation.query, inclusion }),
		})
	}
	return operation
}

/** Preserves item order, private identities, and one final batch projection. */
export const executeRequestTerminalBatch = async (
	entries: readonly OperationBatchEntry[],
	projection: OperationBatchProjection | undefined,
	pipeline: RuntimePipeline,
	terminal: BatchTerminalExecutor,
): Promise<readonly unknown[]> => {
	if (projection === undefined) {
		const results: unknown[] = []
		for (const entry of entries) {
			const result = await terminal.execute(entry.operation)
			if (entry.requireResult === true && result === null) {
				throw createProtectedObjectNotFoundError()
			}
			results.push(result)
		}
		return immutableArray(results)
	}

	const records: Readonly<Record<string, unknown>>[] = []
	const objectIds: string[] = []
	let context: RequestContext | undefined
	for (const entry of entries) {
		const execution = await terminal.executeWithRuntime(entry.operation)
		context = execution.context
		if (entry.requireResult === true && execution.result === null) {
			throw createProtectedObjectNotFoundError()
		}
		if (!isPlainRecord(execution.result)) {
			throw new TypeError('Mutation batch projection requires record results')
		}
		const identity = readRuntimeSchemaModelMetadata(execution.result)?.objectId
		if (typeof identity !== 'string') {
			throw new TypeError(
				'Mutation batch result is missing its persisted object id',
			)
		}
		records.push(execution.result)
		objectIds.push(identity)
	}
	if (context === undefined) {
		throw new TypeError(
			'Mutation batch projection is missing its effective request context',
		)
	}

	const projected = await projectRuntimeMutationBatch(pipeline, {
		context,
		objectIds: immutableArray(objectIds),
		operation: projection.operation,
		results: immutableArray(records),
	})
	return immutableArray(
		entries.map((entry, index) => {
			const operation = projectOperation(
				entry.operation as ExecutableOperationAst,
				projection,
			)
			return materializeOperationResult(
				operation,
				projected[index] as RuntimeOperationResult<typeof operation>,
			)
		}),
	)
}
