import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import type {
	DeleteOneOperationAst,
	GetOperationAst,
	QueryExpressionNode,
	UpdateExpressionNode,
	UpdateOneOperationAst,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { DatabasePersistencePlan } from '../persistence/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import {
	collectDatabaseObjectIdentities,
	retainRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	assertPersistencePlanCapability,
	createDatabasePersistenceRequest,
} from '../persistence/execution.js'
import { createDatabasePersistencePlanWithSelection } from '../persistence/plans.js'
import type { RuntimeInclusionProjector } from '../pipeline/inclusion-projection.js'
import { loadSingularMutationInclusionSource } from '../pipeline/inclusion-projection.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import {
	emptyRuntimeConstraints,
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
	snapshotRuntimeConstraints,
} from '../pipeline/stage-inputs.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import { createRuntimeVirtualFieldScheduler } from '../virtual-fields/binding.js'
import {
	prepareBoundRuntimeVirtualFieldProjection,
	prepareRuntimeVirtualDatabaseResult,
} from '../virtual-fields/pipeline.js'
import { validateSchemaMutationEffect } from './effect.js'
import type { PluginSchemaMutationOperationAst } from './contracts.js'
import type { PluginSchemaMutationRuntime } from './runtime.js'

interface SchemaMutationPipelineBinding {
	readonly boundaries: RuntimeBehaviorBoundaries
	readonly inclusions: RuntimeInclusionProjector
	readonly stages: Readonly<RuntimePipelineStages>
}

export interface RuntimeSchemaMutationRequest {
	readonly command: CompiledSchemaMutationCommand
	readonly context: RequestContext
	readonly envelope: PluginSchemaMutationEnvelope
	readonly runtime: PluginSchemaMutationRuntime
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
		readonly constraints: readonly DatabaseConstraintNode[]
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

const projectResolverItem = (
	command: CompiledSchemaMutationCommand,
	target: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const fields = new Set(['id', ...Object.keys(command.mutation.select)])
	return immutableRecord(
		Object.fromEntries(
			Object.entries(target).filter(([field]) => fields.has(field)),
		),
	)
}

const projectResultRecord = (
	record: Readonly<Record<string, unknown>>,
	fields: readonly string[],
): Readonly<Record<string, unknown>> => {
	if (fields.length === 0) return record
	const selected = new Set(['id', ...fields])
	return immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([field]) => selected.has(field)),
		),
	)
}

const assertLogicalIdentity: (
	command: CompiledSchemaMutationCommand,
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
		operation.mutation !== command.mutation ||
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

const createStageInput = (
	context: RequestContext,
	operation: PluginSchemaMutationOperationAst,
	extra: Readonly<Record<string, unknown>> = immutableRecord({}),
) => immutableRecord({ context, operation, ...extra })

const createBeforeInclusionSource = async (
	executor: DatabaseTransactionAdapter,
	physical: SchemaMutationPhysicalOperation,
	id: string,
	inclusions: Parameters<RuntimeInclusionProjector['hydrate']>[4],
): Promise<Readonly<Record<string, unknown>> | undefined> => {
	if (inclusions.length === 0) return undefined
	const query = 'query' in physical ? physical.query : undefined
	if (query === undefined) return undefined
	const get: GetOperationAst<SchemaDefinition, QueryExpressionNode> =
		immutableRecord({
			id,
			kind: 'get',
			query: immutableRecord({ ...query, where: undefined }),
		})
	const result: unknown = await executor.execute(
		createDatabasePersistenceRequest({
			constraints: emptyRuntimeConstraints,
			inclusions: immutableArray(inclusions.map(({ database }) => database)),
			operation: get,
		}),
	)
	if (!isPlainRecord(result)) {
		throw new TypeError('Schema mutation inclusion source must be a record')
	}
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
	const { command, context, envelope, runtime, schema } = request
	let logical: PluginSchemaMutationOperationAst = immutableRecord({
		command: envelope.command,
		effect: undefined,
		id: envelope.id,
		input: envelope.payload,
		item: undefined,
		kind: 'plugin-schema-mutation' as const,
		mutation: command.mutation,
		originalItem: undefined,
		owner: command.owner,
		query: envelope.query,
	})
	let enforcement: EnforcementState | undefined
	let constraints: readonly DatabaseConstraintNode[] = emptyRuntimeConstraints
	let rowFilter: DatabaseRowFilterNode | undefined

	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'pipeline-start',
	})
	if (stages.enforcement !== undefined) {
		enforcement = await stages.enforcement.evaluate(
			createStageInput(context, logical) as never,
		)
		const enforced = await stages.enforcement.enforceOperation(
			createStageInput(context, logical, { enforcement }) as never,
		)
		const candidateOperation: unknown = enforced.operation
		assertLogicalIdentity(command, schema, envelope, candidateOperation)
		logical = candidateOperation
		constraints = snapshotRuntimeConstraints(enforced.constraints)
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
			constraints,
			operation: preparationOperation,
			plan: preparationPlan,
			...(rowFilter === undefined ? {} : { rowFilter }),
		}),
	)) as unknown as SchemaMutationPreparedOperation
	const target = readPreparedTarget(prepared)
	if (target === null) throw createProtectedObjectNotFoundError()
	const completeOriginal = boundaries.snapshotValue(target)
	const resolverOriginal = projectResolverItem(command, completeOriginal)

	if (
		stages.enforcement?.enforcePreparedMutation !== undefined &&
		enforcement !== undefined
	) {
		await stages.enforcement.enforcePreparedMutation(
			createStageInput(context, logical, { target: completeOriginal }) as never,
		)
	}
	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'schema-mutation-handler',
	})
	const candidate = await runtime.resolve(
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
			createStageInput(context, logical, { enforcement }) as never,
		)
		const enforced = await stages.enforcement.enforceOperation(
			createStageInput(context, logical, { enforcement }) as never,
		)
		const candidateOperation: unknown = enforced.operation
		assertLogicalIdentity(command, schema, envelope, candidateOperation)
		logical = candidateOperation
		constraints = snapshotRuntimeConstraints(enforced.constraints)
		if (stages.enforcement.enforcePreparedMutation !== undefined) {
			await stages.enforcement.enforcePreparedMutation(
				createStageInput(context, logical, {
					enforcement,
					target: completeOriginal,
				}) as never,
			)
		}
	}
	if (stages.behaviors?.beforeOperation !== undefined) {
		await stages.behaviors.beforeOperation(
			createStageInput(context, logical) as never,
		)
	}
	if (stages.behaviors?.observePreparedMutation !== undefined) {
		await stages.behaviors.observePreparedMutation(
			createStageInput(context, logical, { target: completeOriginal }) as never,
		)
	}

	const physical = createPhysicalOperation(logical)
	const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
		physical,
		virtualScheduler,
	)
	const preparedInclusions = await inclusions.prepare(context, physical)
	const beforeInclusionSource =
		command.mutation.returning === 'before'
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
	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'database-operation',
	})
	let outcome: SchemaMutationOutcome = await prepared.execute(
		immutableRecord({
			constraints,
			operation: physical,
			plan: persistencePlan,
		}),
	)
	outcome = boundaries.snapshotMutationOutcome(
		physical,
		outcome,
		virtualProjection?.persistedSelection.fields.map(({ field }) => field),
	)
	if (
		stages.enforcement?.enforceMutationOutcome !== undefined &&
		enforcement !== undefined
	) {
		outcome = (await stages.enforcement.enforceMutationOutcome(
			createStageInput(context, logical, { enforcement, outcome }) as never,
		)) as unknown as SchemaMutationOutcome
	}
	if (stages.behaviors?.transformMutationOutcome !== undefined) {
		outcome = (await stages.behaviors.transformMutationOutcome(
			createStageInput(context, logical, { outcome }) as never,
		)) as unknown as SchemaMutationOutcome
	}
	outcome = boundaries.snapshotMutationOutcome(
		physical,
		outcome,
		virtualProjection?.persistedSelection.fields.map(({ field }) => field),
	)
	const materialization = outcome.materializations[0]
	if (
		materialization === undefined ||
		(command.mutation.effect === 'update'
			? materialization.kind !== 'update'
			: materialization.kind !== 'delete')
	) {
		throw new TypeError('Database adapter returned an invalid schema mutation')
	}
	const previous = materialization.previous
	const sourceRecord =
		command.mutation.returning === 'before'
			? previous
			: materialization.kind === 'update'
				? materialization.current
				: previous
	const virtualResults = prepareRuntimeVirtualDatabaseResult(
		boundaries,
		physical,
		virtualProjection,
		projectResultRecord(
			sourceRecord,
			(
				virtualProjection?.persistedSelection ?? physical.query.selection
			).fields.map(({ field }) => field),
		) as DatabaseOperationResult<typeof physical>,
	)
	let databaseResult = virtualResults.publicResult
	const selectedFieldsOverride = readRuntimeSelectedFieldsOverride(
		logical as never,
		enforcement,
	)
	if (stages.enforcement !== undefined && enforcement !== undefined) {
		databaseResult = await stages.enforcement.enforceSelectionResult(
			createStageInput(context, logical, {
				enforcement,
				result: databaseResult,
			}) as never,
		)
	}
	databaseResult = boundaries.snapshotDatabaseResultReplacement(
		physical,
		databaseResult,
		selectedFieldsOverride,
	)
	if (stages.behaviors?.transformDatabaseResult !== undefined) {
		databaseResult = await stages.behaviors.transformDatabaseResult(
			createStageInput(context, logical, {
				result: databaseResult,
				selectedFieldsOverride,
			}) as never,
		)
	}
	const afterInclusionSource =
		command.mutation.returning === 'after'
			? await loadSingularMutationInclusionSource(
					executor,
					physical,
					outcome as never,
					preparedInclusions.length === 0
						? undefined
						: preparedInclusions.map(({ database }) => database),
					virtualProjection?.persistedSelection,
				)
			: undefined
	let result = await inclusions.hydrate(
		context,
		physical,
		databaseResult,
		afterInclusionSource ?? beforeInclusionSource ?? sourceRecord,
		preparedInclusions,
		virtualScheduler,
	)
	retainRuntimeSchemaModelMetadata(
		physical,
		collectDatabaseObjectIdentities(
			executor,
			physical,
			sourceRecord,
			outcome as never,
		),
		result,
		readRuntimeSchemaModelSelectedFields(
			logical as never,
			selectedFieldsOverride,
		),
	)
	if (virtualProjection !== undefined) {
		if (virtualScheduler === undefined) {
			throw new TypeError('Schema mutation virtual scheduler is unavailable')
		}
		result = await virtualScheduler.resolve(
			context,
			physical,
			virtualProjection,
			result,
			virtualResults.privateResult,
		)
	}
	if (stages.behaviors?.transformResult !== undefined) {
		result = await stages.behaviors.transformResult(
			createStageInput(context, logical, {
				outcome,
				result,
				selectedFieldsOverride,
			}) as never,
		)
	}
	result = boundaries.snapshotResultReplacement(
		physical,
		result,
		selectedFieldsOverride,
	)
	if (stages.enforcement !== undefined && enforcement !== undefined) {
		result = await stages.enforcement.enforceResult(
			createStageInput(context, logical, { enforcement, result }) as never,
		)
	}
	throwIfOperationCancelled(context.signal, {
		operationKind: logical.kind,
		phase: 'commit',
	})
	const completed = createStageInput(context, logical, { result })
	await stages.commit(completed as never)
	if (stages.behaviors?.postCommit !== undefined) {
		await stages.behaviors.postCommit(completed as never)
	}
	if (!isPlainRecord(result)) {
		throw new TypeError('Schema mutation result must be a record')
	}

	return immutableRecord({ operation: physical, result })
}
