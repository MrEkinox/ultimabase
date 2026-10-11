import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import type {
	DeleteOneOperationAst,
	GetOperationAst,
	QueryExpressionNode,
	UpdateExpressionNode,
	UpdateOneOperationAst,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationOutcome,
	DatabaseOperationResult,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { DatabasePersistencePlan } from '../persistence/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { collectDatabaseObjectIdentities } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	assertPersistencePlanCapability,
	createDatabasePersistenceRequest,
} from '../persistence/execution.js'
import { createDatabasePersistencePlanWithSelection } from '../persistence/plans.js'
import type { RuntimeInclusionProjector } from '../pipeline/inclusion-projection.js'
import { loadSingularMutationInclusionSource } from '../pipeline/mutation-inclusion-source.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { finalizeRuntimeOperationResult } from '../pipeline/result-finalization.js'
import {} from '../pipeline/stage-inputs.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import {
	createRuntimeRelationFilterResolver,
	createRuntimeVirtualFieldScheduler,
} from '../pipeline/application-bindings.js'
import {
	assertReadableMutationRows,
	prepareReadableResultCheck,
} from '../enforcement/readable-results.js'
import { prepareBoundRuntimeVirtualFieldProjection } from '../virtual-fields/pipeline.js'
import { validateSchemaMutationEffect } from './effect.js'
import type { PluginSchemaMutationOperationAst } from './contracts.js'
import { resolveSchemaMutation } from './runtime.js'
import { describeSchemaMutationConflict } from './unique-conflict.js'
import { assertPlainObject } from '../../exact-object-validation.js'

interface SchemaMutationPipelineBinding {
	readonly boundaries: RuntimeBehaviorBoundaries
	readonly inclusions: RuntimeInclusionProjector
	readonly stages: Readonly<RuntimePipelineStages>
}

export interface RuntimeSchemaMutationRequest {
	readonly application: object
	readonly command: CompiledMutationCommand
	readonly context: RequestContext
	readonly envelope: PluginSchemaMutationEnvelope
	readonly schema: SchemaDefinition
}

export interface RuntimeSchemaMutationResult {
	readonly operation: SchemaMutationPhysicalOperation
	readonly result: Readonly<Record<string, unknown>>
}

type SchemaMutationDeleteOperation = DeleteOneOperationAst<
	SchemaDefinition,
	QueryExpressionNode
>
type SchemaMutationUpdateOperation = UpdateOneOperationAst<
	SchemaDefinition,
	UpdateExpressionNode,
	QueryExpressionNode
>
type SchemaMutationPhysicalOperation =
	SchemaMutationDeleteOperation | SchemaMutationUpdateOperation
type SchemaMutationOutcome =
	| DatabaseOperationOutcome<SchemaMutationDeleteOperation>
	| DatabaseOperationOutcome<SchemaMutationUpdateOperation>

interface SchemaMutationPreparedOperation {
	readonly target: Readonly<Record<string, unknown>> | null
	execute(request: {
		readonly operation: SchemaMutationPhysicalOperation
		readonly plan: DatabasePersistencePlan
	}): Promise<SchemaMutationOutcome>
}

const pipelineBindings = new WeakMap<
	RuntimePipeline,
	SchemaMutationPipelineBinding
>()

/** @internal Installs Core-owned collaborators without exposing pipeline state. */
export const registerRuntimeSchemaMutationPipeline = (
	pipeline: RuntimePipeline,
	binding: SchemaMutationPipelineBinding,
): void => {
	pipelineBindings.set(pipeline, binding)
}

/** @internal Reads the stages bound to one pipeline for many-row target resolution. */
export const readRuntimeSchemaMutationStages = (
	pipeline: RuntimePipeline,
): Readonly<RuntimePipelineStages> | undefined =>
	pipelineBindings.get(pipeline)?.stages

const readPreparedTarget = (
	prepared: SchemaMutationPreparedOperation,
): Readonly<Record<string, unknown>> | null => {
	const candidate: unknown = prepared
	if (!isPlainRecord(candidate) || !Object.hasOwn(candidate, 'target')) {
		throw new TypeError(
			'Prepared schema mutation must expose its complete target',
		)
	}
	const target: unknown = candidate.target
	if (target !== null && !isPlainRecord(target)) {
		throw new TypeError('Prepared schema mutation target must be a record')
	}
	return target
}

/** Keeps the identity and the selected fields of one record, in record order. */
const pickFields = (
	record: Readonly<Record<string, unknown>>,
	fields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const selected = new Set(['id', ...fields])
	return immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([field]) => selected.has(field)),
		),
	)
}

const assertLogicalIdentity: (
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	operation: unknown,
) => asserts operation is PluginSchemaMutationOperationAst = (
	command,
	schema,
	envelope,
	operation,
) => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'plugin-schema-mutation' ||
		operation.command !== envelope.command ||
		operation.id !== envelope.id ||
		operation.mutation !== command.definition ||
		operation.owner !== command.owner ||
		!isPlainRecord(operation.query) ||
		!isPlainRecord(operation.query.schema) ||
		operation.query.schema.definition !== schema
	) {
		throw new TypeError(
			'Runtime enforcement must retain the exact schema mutation identity',
		)
	}
}

const preparePhysicalOperation = (
	logical: PluginSchemaMutationOperationAst,
): SchemaMutationDeleteOperation =>
	immutableRecord({ kind: 'delete-one' as const, query: logical.query })

const createPhysicalOperation = (
	logical: PluginSchemaMutationOperationAst,
): SchemaMutationPhysicalOperation => {
	if (logical.effect?.kind === 'update') {
		const operation: SchemaMutationUpdateOperation = immutableRecord({
			kind: 'update-one',
			query: logical.query,
			update: logical.effect.update,
		})
		return operation
	}
	const operation: SchemaMutationDeleteOperation = immutableRecord({
		kind: 'delete-one',
		query: logical.query,
	})
	return operation
}

const emptyStageInput = immutableRecord({})

const createStageInput = <const TExtra extends object>(
	context: RequestContext,
	operation: PluginSchemaMutationOperationAst,
	extra: TExtra,
) => immutableRecord({ context, operation, ...extra })

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

/** Executes one custom logical mutation through one retained transaction target. */
export const executeRuntimeSchemaMutation = async (
	pipeline: RuntimePipeline,
	request: RuntimeSchemaMutationRequest,
): Promise<RuntimeSchemaMutationResult> => {
	const binding = pipelineBindings.get(pipeline)
	const executor = readPipelineTransactionAdapter(pipeline)
	if (binding === undefined || executor === undefined) {
		throw new TypeError(
			'Runtime schema mutations require an active transaction pipeline',
		)
	}
	const { boundaries, inclusions, stages } = binding
	const { application, command, context, envelope, schema } = request
	let logical: PluginSchemaMutationOperationAst = immutableRecord({
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
	let enforcement: EnforcementState | undefined
	let rowFilter: DatabaseRowFilterNode | undefined

	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'pipeline-start',
	})
	if (stages.enforcement !== undefined) {
		enforcement = await stages.enforcement.evaluate(
			createStageInput(context, logical, emptyStageInput),
		)
		const enforced = await stages.enforcement.enforceOperation(
			createStageInput(context, logical, { enforcement }),
		)
		const candidateOperation: unknown = enforced.operation
		assertLogicalIdentity(command, schema, envelope, candidateOperation)
		logical = candidateOperation
		rowFilter = enforced.rowFilter
	}

	const preparationOperation = preparePhysicalOperation(logical)
	const virtualScheduler = createRuntimeVirtualFieldScheduler(pipeline)
	const preparationVirtualProjection =
		prepareBoundRuntimeVirtualFieldProjection(
			preparationOperation,
			virtualScheduler,
		)
	const preparationPlan = createDatabasePersistencePlanWithSelection(
		preparationOperation,
		preparationVirtualProjection?.persistedSelection ??
			preparationOperation.query.selection,
	)
	assertPersistencePlanCapability(executor, preparationPlan)
	const prepared = (await executor.prepare(
		immutableRecord({
			operation: preparationOperation,
			plan: preparationPlan,
			...(rowFilter === undefined ? {} : { rowFilter }),
		}),
	)) as unknown as SchemaMutationPreparedOperation
	const target = readPreparedTarget(prepared)
	if (target === null) throw createProtectedObjectNotFoundError()
	const completeOriginal = boundaries.snapshotValue(target)
	const resolverOriginal = pickFields(
		completeOriginal,
		Object.keys(command.definition.select),
	)

	if (
		stages.enforcement?.enforcePreparedMutation !== undefined &&
		enforcement !== undefined
	) {
		await stages.enforcement.enforcePreparedMutation(
			createStageInput(context, logical, { target: completeOriginal }),
		)
	}
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
		resolverOriginal,
	)
	const validated = validateSchemaMutationEffect(
		command,
		schema,
		completeOriginal,
		candidate,
	)
	logical = immutableRecord({
		...logical,
		effect: validated.effect,
		item: validated.current,
		originalItem: completeOriginal,
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
					target: completeOriginal,
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
			createStageInput(context, logical, { target: completeOriginal }),
		)
	}

	const physical = createPhysicalOperation(logical)
	const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
		physical,
		virtualScheduler,
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
	let persistencePlan = createDatabasePersistencePlanWithSelection(
		physical,
		virtualProjection?.persistedSelection ?? physical.query.selection,
	)
	if (stages.persistencePlanRewrite !== undefined) {
		persistencePlan = await stages.persistencePlanRewrite(
			immutableRecord({
				logicalOperation: logical,
				plan: persistencePlan,
			}),
		)
	}
	assertPersistencePlanCapability(executor, persistencePlan)
	// Pre-image results are checked on the locked target before the write,
	// resulting rows after it (ADR-0306).
	const readable = prepareReadableResultCheck({
		context,
		executor,
		operation: logical,
		relationFilters: createRuntimeRelationFilterResolver(pipeline),
		stages,
	})
	const preImage =
		(command.definition.checkReadable ?? command.definition.returning) ===
		'before'
	if (readable !== undefined && preImage) {
		await assertReadableMutationRows(readable, [envelope.id])
	}
	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'database-operation',
	})
	let outcome: SchemaMutationOutcome = await prepared
		.execute(immutableRecord({ operation: physical, plan: persistencePlan }))
		.catch((error: unknown) => {
			throw describeSchemaMutationConflict(error, {
				className: schema.className,
				command: envelope.command,
				id: envelope.id,
				original: completeOriginal,
			})
		})
	outcome = boundaries.snapshotMutationOutcome(
		physical,
		outcome,
		virtualProjection?.persistedSelection.fields.map(({ field }) => field),
	)
	if (
		stages.enforcement?.enforceMutationOutcome !== undefined &&
		enforcement !== undefined
	) {
		outcome = await stages.enforcement.enforceMutationOutcome(
			createStageInput(context, logical, { enforcement, outcome }),
		)
	}
	if (stages.behaviors?.transformMutationOutcome !== undefined) {
		outcome = await stages.behaviors.transformMutationOutcome(
			createStageInput(context, logical, { outcome }),
		)
	}
	outcome = boundaries.snapshotMutationOutcome(
		physical,
		outcome,
		virtualProjection?.persistedSelection.fields.map(({ field }) => field),
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
		...(readable === undefined || preImage
			? {}
			: {
					assertReadableResult: () =>
						assertReadableMutationRows(readable, [envelope.id]),
				}),
	})
	assertPlainObject(result, 'Schema mutation result must be a record')

	return immutableRecord({ operation: physical, result })
}
