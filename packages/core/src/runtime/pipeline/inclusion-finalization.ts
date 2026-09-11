import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { retainRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import {
	createRuntimeProjectedDatabaseResultInput,
	readRuntimeSchemaModelSelectedFields,
} from './stage-inputs.js'
import type {
	RuntimeOperationResult,
	RuntimePipelineStages,
} from './contracts.js'
import type { RuntimePreparedInclusion } from './inclusion-projection.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import { prepareRuntimeVirtualDatabaseResult } from '../virtual-fields/pipeline.js'

export type RuntimeInclusionHydrator = (
	result: DatabaseOperationResult<RuntimePreparedInclusion['operation']>,
	rawResult: DatabaseOperationResult<RuntimePreparedInclusion['operation']>,
	inclusions: readonly RuntimePreparedInclusion[],
	scheduler: RuntimeVirtualFieldScheduler | undefined,
) => Promise<RuntimeOperationResult<RuntimePreparedInclusion['operation']>>

/** Restores the terminal-specific result after inclusion hydration preserves cardinality. */
export const restoreRuntimeInclusionResult = <
	const TOperation extends DatabaseOperationAst,
>(
	result: unknown,
): RuntimeOperationResult<TOperation> =>
	// Callers validate the exact null, record, or array shape before replacing fields.
	result as RuntimeOperationResult<TOperation>

/** Completes one eager target through the same private virtual projection boundary. */
export const finalizeRuntimeInclusionValue = async (
	context: RequestContext,
	prepared: RuntimePreparedInclusion,
	rawTarget:
		| Readonly<Record<string, unknown>>
		| readonly Readonly<Record<string, unknown>>[],
	stages: Readonly<RuntimePipelineStages>,
	boundaries: RuntimeBehaviorBoundaries,
	hydrate: RuntimeInclusionHydrator,
	scheduler?: RuntimeVirtualFieldScheduler,
): Promise<unknown> => {
	const source = rawTarget as DatabaseOperationResult<
		RuntimePreparedInclusion['operation']
	>
	const virtualResults = prepareRuntimeVirtualDatabaseResult(
		boundaries,
		prepared.operation,
		prepared.virtualProjection,
		source,
	)
	let result = virtualResults.publicResult

	if (stages.enforcement !== undefined && prepared.enforcement !== undefined) {
		result = await stages.enforcement.enforceSelectionResult(
			immutableRecord({
				context,
				enforcement: prepared.enforcement,
				operation: prepared.operation,
				result,
			}),
		)
	}
	result = boundaries.snapshotDatabaseResultReplacement(
		prepared.operation,
		result,
		prepared.selectedFieldsOverride,
	)
	if (stages.behaviors?.transformDatabaseResult !== undefined) {
		result = await stages.behaviors.transformDatabaseResult(
			createRuntimeProjectedDatabaseResultInput(
				context,
				prepared.operation,
				result,
				prepared.selectedFieldsOverride,
			),
		)
	}

	let finalized = await hydrate(result, source, prepared.nested, scheduler)
	const rawRecords = isUnknownArray(rawTarget) ? rawTarget : [rawTarget]
	const identities = immutableArray(
		rawRecords.map((record) =>
			isPlainRecord(record)
				? stages.databaseOperation.readObjectIdentity?.(record)
				: undefined,
		),
	)
	retainRuntimeSchemaModelMetadata(
		prepared.operation,
		identities,
		finalized,
		readRuntimeSchemaModelSelectedFields(
			prepared.operation,
			prepared.selectedFieldsOverride,
		),
	)

	if (prepared.virtualProjection !== undefined) {
		if (scheduler === undefined) {
			throw new FrameworkError(
				'INTERNAL_ERROR',
				'Runtime included virtual fields are not application-bound.',
				{ publicMessage: 'The operation could not be completed.' },
			)
		}
		finalized = await scheduler.resolve(
			context,
			prepared.operation,
			prepared.virtualProjection,
			finalized,
			virtualResults.privateResult,
		)
	}

	if (stages.enforcement !== undefined && prepared.enforcement !== undefined) {
		finalized = await stages.enforcement.enforceResult(
			immutableRecord({
				context,
				enforcement: prepared.enforcement,
				operation: prepared.operation,
				result: finalized,
			}),
		)
	}
	if (prepared.descriptor.kind === 'pointer' && !isPlainRecord(finalized)) {
		throw new TypeError('Runtime included pointer target must be a record')
	}
	if (prepared.descriptor.kind === 'relation' && !isUnknownArray(finalized)) {
		throw new TypeError('Runtime included relation target must be an array')
	}
	return finalized
}
