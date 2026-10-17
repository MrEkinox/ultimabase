import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationManyEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import { assertDatabaseRequestCapabilities } from '../pipeline/database-capability-validation.js'
import { createRuntimeRelationFilterResolver } from '../pipeline/application-bindings.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import type { RuntimeLogicalOperationAst } from '../pipeline/contracts.js'
import { enforceRuntimeOperation } from '../pipeline/stage-inputs.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import { readRuntimeSchemaMutationStages } from './execution-support.js'

/** Names the rows one many-row command targets. */
export interface RuntimeSchemaMutationTargetRequest {
	readonly command: CompiledMutationCommand
	readonly context: RequestContext
	readonly envelope: PluginSchemaMutationManyEnvelope
	readonly schema: SchemaDefinition
}

// No identifier yet: like `can()`, the command is enforced without a row.
const createTargetingOperation = ({
	command,
	envelope,
}: RuntimeSchemaMutationTargetRequest): RuntimeLogicalOperationAst =>
	immutableRecord({
		command: envelope.command,
		effect: undefined,
		id: '',
		input: envelope.payload,
		item: undefined,
		kind: 'plugin-schema-mutation' as const,
		mutation: command.definition,
		originalItem: undefined,
		owner: command.owner,
		query: envelope.query,
	})

/**
 * Resolves, inside the command's transaction, the identifiers of the rows a
 * many-row command targets (ADR-0316): rows matching its `where` and the row
 * constraints enforced for that very command (protected policies, Access
 * filters), in identifier order. Each row is then written by the one-row
 * pipeline, which enforces every rule again on its locked target.
 */
export const resolveRuntimeSchemaMutationTargets = async (
	pipeline: RuntimePipeline,
	request: RuntimeSchemaMutationTargetRequest,
): Promise<readonly string[]> => {
	const stages = readRuntimeSchemaMutationStages(pipeline)
	const executor = readPipelineTransactionAdapter(pipeline)
	if (stages === undefined || executor === undefined) {
		throw new TypeError(
			'Runtime schema mutations require an active transaction pipeline',
		)
	}
	const { context, envelope } = request
	const logical = createTargetingOperation(request)
	const enforced = await enforceRuntimeOperation(
		stages,
		context,
		logical,
		undefined,
		undefined,
		createRuntimeRelationFilterResolver(pipeline),
	)
	const read = immutableRecord({
		kind: 'find-many' as const,
		query: envelope.query,
	})
	const databaseRequest = createDatabasePersistenceRequest({
		operation: read,
		...(enforced.rowFilter === undefined
			? {}
			: { rowFilter: enforced.rowFilter }),
		...(enforced.relationPredicates === undefined
			? {}
			: { relationPredicates: enforced.relationPredicates }),
	})
	assertDatabaseRequestCapabilities(executor, databaseRequest)
	const rows: unknown = await executor.execute(databaseRequest)
	if (!Array.isArray(rows)) {
		throw new TypeError('Database adapter returned invalid many-row targets')
	}
	const ids = rows.map((row: unknown) => {
		if (!isPlainRecord(row) || typeof row.id !== 'string') {
			throw new TypeError('Database adapter returned a target without an id')
		}
		return row.id
	})
	return [...new Set(ids)].sort()
}
