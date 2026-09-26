import { immutableRecord } from '@ultimabase/shared'

import type { RuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import type {
	DatabaseMutationMaterializationSource,
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { retainRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import { prepareRuntimeVirtualDatabaseResult } from '../virtual-fields/pipeline.js'
import type { RuntimeVirtualFieldProjection } from '../virtual-fields/projection.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimePipelineStages,
} from './contracts.js'
import {
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
} from './stage-inputs.js'

interface RuntimeResultFinalizationRequest<
	TOperation extends RuntimeLogicalOperationAst,
	TDatabaseOperation extends DatabaseOperationAst,
> {
	readonly boundaries: RuntimeBehaviorBoundaries
	readonly databaseOperation: TDatabaseOperation
	readonly databaseResult: DatabaseOperationResult<TDatabaseOperation>
	readonly enforcement: EnforcementState | undefined
	readonly hydrate: (
		result: DatabaseOperationResult<TDatabaseOperation>,
	) => Promise<RuntimeOperationResult<TOperation>>
	readonly objectIdentities: readonly unknown[]
	readonly outcome: DatabaseMutationMaterializationSource | undefined
	readonly stageInput: RuntimeOperationStageInput<TOperation>
	readonly stages: Readonly<RuntimePipelineStages>
	readonly virtualProjection: RuntimeVirtualFieldProjection | undefined
	readonly virtualScheduler: RuntimeVirtualFieldScheduler | undefined
}

/** Owns the shared terminal order after one persisted result is available. */
export const finalizeRuntimeOperationResult = async <
	const TOperation extends RuntimeLogicalOperationAst,
	const TDatabaseOperation extends DatabaseOperationAst,
>(
	request: RuntimeResultFinalizationRequest<TOperation, TDatabaseOperation>,
): Promise<RuntimeOperationResult<TOperation>> => {
	const { enforcement, stageInput, stages } = request
	const selectedFieldsOverride = readRuntimeSelectedFieldsOverride(
		stageInput.operation,
		enforcement,
	)
	const virtualResults = prepareRuntimeVirtualDatabaseResult(
		request.boundaries,
		request.databaseOperation,
		request.virtualProjection,
		request.databaseResult,
	)
	let databaseResult = virtualResults.publicResult

	if (stages.enforcement !== undefined && enforcement !== undefined) {
		databaseResult = await stages.enforcement.enforceSelectionResult(
			immutableRecord({ ...stageInput, enforcement, result: databaseResult }),
		)
	}
	databaseResult = request.boundaries.snapshotDatabaseResultReplacement(
		request.databaseOperation,
		databaseResult,
		selectedFieldsOverride,
	)
	if (stages.behaviors?.transformDatabaseResult !== undefined) {
		databaseResult = await stages.behaviors.transformDatabaseResult(
			immutableRecord({
				...stageInput,
				result: databaseResult,
				...(selectedFieldsOverride === undefined
					? {}
					: { selectedFieldsOverride }),
			}),
		)
	}

	let result = await request.hydrate(databaseResult)
	retainRuntimeSchemaModelMetadata(
		request.databaseOperation,
		request.objectIdentities,
		result,
		readRuntimeSchemaModelSelectedFields(
			stageInput.operation,
			selectedFieldsOverride,
		),
	)
	if (request.virtualProjection !== undefined) {
		if (request.virtualScheduler === undefined) {
			throw new TypeError('Runtime virtual scheduler is unavailable')
		}
		result = (await request.virtualScheduler.resolve(
			stageInput.context,
			request.databaseOperation,
			request.virtualProjection,
			result as unknown as RuntimeOperationResult<TDatabaseOperation>,
			virtualResults.privateResult,
		)) as unknown as RuntimeOperationResult<TOperation>
	}
	if (stages.behaviors?.transformResult !== undefined) {
		result = await stages.behaviors.transformResult(
			immutableRecord({
				...stageInput,
				...(request.outcome === undefined ? {} : { outcome: request.outcome }),
				result,
				...(selectedFieldsOverride === undefined
					? {}
					: { selectedFieldsOverride }),
			}),
		)
	}
	result = request.boundaries.snapshotResultReplacement(
		request.databaseOperation,
		result,
		selectedFieldsOverride,
	) as unknown as RuntimeOperationResult<TOperation>
	if (stages.enforcement !== undefined && enforcement !== undefined) {
		result = await stages.enforcement.enforceResult(
			immutableRecord({ ...stageInput, enforcement, result }),
		)
	}

	throwIfOperationCancelled(stageInput.context.signal, {
		operationKind: stageInput.operation.kind,
		phase: 'commit',
	})
	const completed = immutableRecord({ ...stageInput, result })
	await stages.commit(completed)
	if (stages.behaviors?.postCommit !== undefined) {
		await stages.behaviors.postCommit(completed)
	}
	return result
}
