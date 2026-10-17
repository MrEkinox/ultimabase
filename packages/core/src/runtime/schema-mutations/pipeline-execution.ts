import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import type { DatabaseMutationMaterialization } from '../database/contracts.js'
import {
	prepareReadableResultHooks,
	type ReadableResultHooks,
} from '../enforcement/readable-results.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import { assertPersistencePlanCapability } from '../persistence/execution.js'
import { createDatabasePersistencePlanWithSelection } from '../persistence/plans.js'
import {
	createRuntimeRelationFilterResolver,
	createRuntimeVirtualFieldScheduler,
} from '../pipeline/application-bindings.js'
import { assertDatabaseRequestCapabilities } from '../pipeline/database-capability-validation.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { enforceRuntimeOperation } from '../pipeline/stage-inputs.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import { prepareBoundRuntimeVirtualFieldProjection } from '../virtual-fields/pipeline.js'
import type { PluginSchemaMutationOperationAst } from './contracts.js'
import {
	assertLogicalIdentity,
	createStageInput,
	preparePhysicalOperation,
	readPreparedTarget,
	readRuntimeSchemaMutationBinding,
	type LockedSchemaMutation,
	type RuntimeSchemaMutationRequest,
	type RuntimeSchemaMutationResult,
	type SchemaMutationPreparedOperation,
} from './execution-support.js'
import { completeRuntimeSchemaMutation } from './mutation-completion.js'

/** Names the rows of one many-row command, each already a one-row envelope. */
export interface RuntimeSchemaMutationRowsRequest extends Omit<
	RuntimeSchemaMutationRequest,
	'envelope'
> {
	readonly envelopes: readonly PluginSchemaMutationEnvelope[]
}

/**
 * Runs the native policy prefix (ADR-0344): protected policy with its row
 * filter and relation predicates, the database capability assertions, then
 * locks the target and checks item rules on it.
 */
const lockRuntimeSchemaMutation = async (
	pipeline: RuntimePipeline,
	request: RuntimeSchemaMutationRequest,
): Promise<LockedSchemaMutation> => {
	const binding = readRuntimeSchemaMutationBinding(pipeline)
	const executor = readPipelineTransactionAdapter(pipeline)
	if (binding === undefined || executor === undefined) {
		throw new TypeError(
			'Runtime schema mutations require an active transaction pipeline',
		)
	}
	const { boundaries, stages } = binding
	const { command, context, envelope, schema } = request
	const initial: PluginSchemaMutationOperationAst = immutableRecord({
		command: envelope.command,
		effect: undefined,
		id: envelope.id,
		input: envelope.payload,
		item: undefined,
		kind: 'plugin-schema-mutation' as const,
		mutation: command.definition,
		originalItem: undefined,
		owner: command.owner,
		query: envelope.query,
	})

	throwIfOperationCancelled(context.signal, {
		operationKind: initial.kind,
		phase: 'pipeline-start',
	})
	const enforced = await enforceRuntimeOperation(
		stages,
		context,
		initial,
		undefined,
		undefined,
		createRuntimeRelationFilterResolver(pipeline),
	)
	const candidateOperation: unknown = enforced.operation
	assertLogicalIdentity(command, schema, envelope, candidateOperation)
	const logical = candidateOperation
	const { enforcement } = enforced

	const operation = preparePhysicalOperation(logical)
	const virtualScheduler = createRuntimeVirtualFieldScheduler(pipeline)
	const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
		operation,
		virtualScheduler,
	)
	const lock = immutableRecord({
		operation,
		...(enforced.relationPredicates === undefined
			? {}
			: { relationPredicates: enforced.relationPredicates }),
		...(enforced.rowFilter === undefined
			? {}
			: { rowFilter: enforced.rowFilter }),
	})
	assertDatabaseRequestCapabilities(executor, lock)
	const plan = createDatabasePersistencePlanWithSelection(
		operation,
		virtualProjection?.persistedSelection ?? operation.query.selection,
	)
	assertPersistencePlanCapability(executor, plan)
	const prepared = (await executor.prepare(
		immutableRecord({ ...lock, plan }),
	)) as unknown as SchemaMutationPreparedOperation
	const target = readPreparedTarget(prepared)
	if (target === null) throw createProtectedObjectNotFoundError()
	const original = boundaries.snapshotValue(target)

	if (
		stages.enforcement?.enforcePreparedMutation !== undefined &&
		enforcement !== undefined
	) {
		await stages.enforcement.enforcePreparedMutation(
			createStageInput(context, logical, { target: original }),
		)
	}
	return {
		binding,
		enforcement,
		executor,
		logical,
		original,
		prepared,
		request,
		virtualScheduler,
	}
}

/** Prepares the readability checks shared by every row of one command (ADR-0306). */
const prepareLockedReadableHooks = (
	pipeline: RuntimePipeline,
	locked: LockedSchemaMutation,
): ReadableResultHooks =>
	prepareReadableResultHooks({
		context: locked.request.context,
		executor: locked.executor,
		operation: locked.logical,
		relationFilters: createRuntimeRelationFilterResolver(pipeline),
		stages: locked.binding.stages,
	})

/** Executes one custom logical mutation through one retained transaction target. */
export const executeRuntimeSchemaMutation = async (
	pipeline: RuntimePipeline,
	request: RuntimeSchemaMutationRequest,
): Promise<RuntimeSchemaMutationResult> => {
	const locked = await lockRuntimeSchemaMutation(pipeline, request)
	const readable = prepareLockedReadableHooks(pipeline, locked)
	// A pre-image is checked on the locked target before the handler runs.
	await readable.targets?.([locked.logical.id])
	return completeRuntimeSchemaMutation(locked, readable.result)
}

/**
 * Executes the rows of one many-row command in one transaction (ADR-0316):
 * locks every row first, so that the pre-images are checked with one grouped
 * query (ADR-0306), then runs the rest of the one-row pipeline row by row and
 * checks the resulting rows with one grouped query before commit.
 */
export const executeRuntimeSchemaMutationRows = async (
	pipeline: RuntimePipeline,
	{ envelopes, ...request }: RuntimeSchemaMutationRowsRequest,
): Promise<readonly RuntimeSchemaMutationResult[]> => {
	const rows: LockedSchemaMutation[] = []
	for (const envelope of envelopes) {
		rows.push(
			await lockRuntimeSchemaMutation(pipeline, { ...request, envelope }),
		)
	}
	const [first] = rows
	if (first === undefined) return immutableArray([])
	const readable = prepareLockedReadableHooks(pipeline, first)
	await readable.targets?.(rows.map(({ logical }) => logical.id))
	const written: RuntimeSchemaMutationResult[] = []
	for (const row of rows) {
		written.push(await completeRuntimeSchemaMutation(row, undefined))
	}
	await readable.result?.(
		immutableRecord({
			materializations: immutableArray(
				written.flatMap(
					({ outcome }): readonly DatabaseMutationMaterialization[] =>
						outcome.materializations,
				),
			),
		}),
	)
	return immutableArray(written)
}
