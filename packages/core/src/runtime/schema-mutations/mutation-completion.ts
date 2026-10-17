import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { assertPlainObject } from '../../exact-object-validation.js'
import type { GetOperationAst, QueryExpressionNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import type {
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { ReadableResultHooks } from '../enforcement/readable-results.js'
import { collectDatabaseObjectIdentities } from '../operations/model-metadata.js'
import {
	compileDatabasePersistencePlan,
	createDatabasePersistenceRequest,
} from '../persistence/execution.js'
import type { RuntimeInclusionProjector } from '../pipeline/inclusion-projection.js'
import { loadSingularMutationInclusionSource } from '../pipeline/mutation-inclusion-source.js'
import { runMutationOutcomeStages } from '../pipeline/mutation-outcome-stages.js'
import { finalizeRuntimeOperationResult } from '../pipeline/result-finalization.js'
import { prepareBoundRuntimeVirtualFieldProjection } from '../virtual-fields/pipeline.js'
import type { PluginSchemaMutationOperationAst } from './contracts.js'
import { validateSchemaMutationEffect } from './effect.js'
import {
	assertLogicalIdentity,
	createPhysicalOperation,
	createStageInput,
	emptyStageInput,
	pickFields,
	type LockedSchemaMutation,
	type RuntimeSchemaMutationResult,
	type SchemaMutationPhysicalOperation,
} from './execution-support.js'
import { resolveSchemaMutation } from './runtime.js'
import { describeSchemaMutationConflict } from './unique-conflict.js'

const createBeforeInclusionSource = async (
	executor: DatabaseTransactionAdapter,
	physical: SchemaMutationPhysicalOperation,
	id: string,
	inclusions: Parameters<RuntimeInclusionProjector['hydrate']>[4],
): Promise<Readonly<Record<string, unknown>> | undefined> => {
	if (inclusions.length === 0) return undefined
	const get: GetOperationAst<SchemaDefinition, QueryExpressionNode> =
		immutableRecord({
			id,
			kind: 'get',
			query: immutableRecord({ ...physical.query, where: undefined }),
		})
	const result: unknown = await executor.execute(
		createDatabasePersistenceRequest({
			inclusions: immutableArray(inclusions.map(({ database }) => database)),
			operation: get,
		}),
	)
	assertPlainObject(result, 'Schema mutation inclusion source must be a record')
	return result
}

/**
 * Resolves, revalidates and persists one locked schema mutation in the fixed
 * order of ADR-0245, then finalizes its result through the shared stages.
 */
export const completeRuntimeSchemaMutation = async (
	locked: LockedSchemaMutation,
	assertReadableResult: ReadableResultHooks['result'],
): Promise<RuntimeSchemaMutationResult> => {
	const { binding, executor, original, prepared, virtualScheduler } = locked
	const { boundaries, inclusions, stages } = binding
	const { application, command, context, envelope, schema } = locked.request
	let { enforcement, logical } = locked

	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'schema-mutation-handler',
	})
	const candidate = await resolveSchemaMutation(
		application,
		command,
		schema,
		envelope,
		context,
		pickFields(original, Object.keys(command.definition.select)),
	)
	const validated = validateSchemaMutationEffect(
		command,
		schema,
		original,
		candidate,
	)
	logical = immutableRecord({
		...logical,
		effect: validated.effect,
		item: validated.current,
		originalItem: original,
	})

	if (stages.enforcement !== undefined && enforcement !== undefined) {
		enforcement = await stages.enforcement.reevaluate(
			createStageInput(context, logical, { enforcement }),
		)
		const enforced = await stages.enforcement.enforceOperation(
			createStageInput(context, logical, { enforcement }),
		)
		const candidateOperation: unknown = enforced.operation
		assertLogicalIdentity(command, schema, envelope, candidateOperation)
		logical = candidateOperation
		if (stages.enforcement.enforcePreparedMutation !== undefined) {
			await stages.enforcement.enforcePreparedMutation(
				createStageInput(context, logical, {
					enforcement,
					target: original,
				}),
			)
		}
	}
	if (stages.behaviors?.beforeOperation !== undefined) {
		await stages.behaviors.beforeOperation(
			createStageInput(context, logical, emptyStageInput),
		)
	}
	if (stages.behaviors?.observePreparedMutation !== undefined) {
		await stages.behaviors.observePreparedMutation(
			createStageInput(context, logical, { target: original }),
		)
	}

	const physical = createPhysicalOperation(logical)
	const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
		physical,
		virtualScheduler,
	)
	const persistedFields = virtualProjection?.persistedSelection.fields.map(
		({ field }) => field,
	)
	const preparedInclusions = await inclusions.prepare(context, physical)
	const beforeInclusionSource =
		command.definition.returning === 'before'
			? await createBeforeInclusionSource(
					executor,
					physical,
					envelope.id,
					preparedInclusions,
				)
			: undefined
	const plan = await compileDatabasePersistencePlan(
		executor,
		physical,
		stages.persistencePlanRewrite,
		virtualProjection?.persistedSelection,
		logical,
	)
	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'database-operation',
	})
	const executed = await prepared
		.execute(immutableRecord({ operation: physical, plan }))
		.catch((error: unknown) => {
			throw describeSchemaMutationConflict(error, {
				className: schema.className,
				command: envelope.command,
				id: envelope.id,
				original,
			})
		})
	const outcome = boundaries.snapshotMutationOutcome(
		physical,
		await runMutationOutcomeStages({
			behaviorOperation: logical,
			behaviors: stages.behaviors,
			context,
			enforcement: stages.enforcement,
			enforcementState: enforcement,
			operation: logical,
			outcome: boundaries.snapshotMutationOutcome(
				physical,
				executed,
				persistedFields,
			),
		}),
		persistedFields,
	)
	const materialization = outcome.materializations[0]
	if (
		materialization === undefined ||
		(command.definition.effect === 'update'
			? materialization.kind !== 'update'
			: materialization.kind !== 'delete')
	) {
		throw new TypeError('Database adapter returned an invalid schema mutation')
	}
	const previous = materialization.previous
	const sourceRecord =
		command.definition.returning === 'before'
			? previous
			: materialization.kind === 'update'
				? materialization.current
				: previous
	const resultFields = (
		virtualProjection?.persistedSelection ?? physical.query.selection
	).fields.map(({ field }) => field)
	const databaseResult = (
		resultFields.length === 0
			? sourceRecord
			: pickFields(sourceRecord, resultFields)
	) as DatabaseOperationResult<typeof physical>
	const result = await finalizeRuntimeOperationResult<
		PluginSchemaMutationOperationAst,
		typeof physical
	>({
		boundaries,
		databaseOperation: physical,
		databaseResult,
		enforcement,
		hydrate: async (projectedResult) => {
			const afterInclusionSource =
				command.definition.returning === 'after'
					? await loadSingularMutationInclusionSource(
							executor,
							physical,
							outcome,
							preparedInclusions.length === 0
								? undefined
								: preparedInclusions.map(({ database }) => database),
							virtualProjection?.persistedSelection,
						)
					: undefined
			return (await inclusions.hydrate(
				context,
				physical,
				projectedResult,
				afterInclusionSource ?? beforeInclusionSource ?? sourceRecord,
				preparedInclusions,
				virtualScheduler,
			)) as unknown as Readonly<Record<string, unknown>>
		},
		objectIdentities: collectDatabaseObjectIdentities(
			executor,
			physical,
			sourceRecord,
			outcome,
		),
		outcome,
		stageInput: createStageInput(context, logical, emptyStageInput),
		stages,
		virtualProjection,
		virtualScheduler,
		...(assertReadableResult === undefined ? {} : { assertReadableResult }),
	})
	assertPlainObject(result, 'Schema mutation result must be a record')

	return immutableRecord({ operation: physical, outcome, result })
}
