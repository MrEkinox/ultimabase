import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import type {
	CreateOneOperationAst,
	UpdateOneOperationAst,
} from '../../query/operations/contracts.js'
import { readNestedWriteRootOperation } from '../../schema/nested-writes/operation-markers.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
} from '../../schema/nested-writes/contracts.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import { RequestContext } from '../context/request-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseOperationAst,
	DatabaseOperationResult,
	DatabaseRelationPredicateScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { createRuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { retainRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	inheritRuntimeNestedWrites,
	readRuntimeNestedWrites,
} from '../nested-writes/binding.js'
import {
	createRuntimeNestedWriteStageContext,
	runWithRuntimeNestedWriteStageContext,
} from '../nested-writes/execution-context.js'
import { RuntimeNestedWriteCoordinator } from '../nested-writes/execution.js'
import { readNestedMutationOutcomeId } from '../nested-writes/outcome.js'
import {
	createRuntimeNestedCreateOperation,
	createRuntimeNestedUpdateOperation,
	prepareRuntimeNestedWriteGraph,
} from '../nested-writes/preparation.js'
import {
	readReservedCreateId,
	retainReservedCreateId,
} from '../nested-writes/reserved-create.js'
import { createRuntimeNestedWriteHost } from '../nested-writes/runtime-host.js'
import {
	beginPipelineTransaction,
	type RuntimePipelineTransactionScope,
} from '../transactions/pipeline-transaction.js'
import {
	createRuntimeVirtualFieldScheduler,
	inheritRuntimeVirtualFields,
} from '../virtual-fields/binding.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import {
	prepareBoundRuntimeVirtualFieldProjection,
	prepareRuntimeVirtualDatabaseResult,
} from '../virtual-fields/pipeline.js'
import type {
	RuntimeEnforcementOperationResult,
	RuntimeOperationResult,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultStageInput,
} from './contracts.js'
import { executeRuntimeDatabaseOperation } from './database-execution.js'
import { isRuntimeMutationOperation } from './operation-kind.js'
import {
	retainRuntimeMutationBatchProjector,
	RuntimeInclusionProjector,
} from './inclusion-projection.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import { assertRuntimePipelineStages } from './stage-validation.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeEnforcementResultInput,
	createRuntimeProjectedDatabaseResultInput,
	createRuntimeMaterializedResultInput,
	createRuntimeOperationInput,
	createRuntimeResultInput,
	emptyRuntimeConstraints,
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
	snapshotRuntimeConstraints,
} from './stage-inputs.js'

export { projectRuntimeMutationBatch } from './inclusion-projection.js'
export type { RuntimeMutationBatchProjectionRequest } from './inclusion-projection.js'

/** Combines independent private restrictions without making either transformable. */
const combineDatabaseRowFilters = (
	first: DatabaseRowFilterNode | undefined,
	second: DatabaseRowFilterNode | undefined,
): DatabaseRowFilterNode | undefined => {
	if (first === undefined) {
		return second
	}

	if (second === undefined) {
		return first
	}

	return normalizeLogicalFilter({
		kind: 'and',
		expressions: [first, second],
	})
}

/** Carries only mutable orchestration state that never crosses a behavior boundary. */
interface RuntimePipelineExecutionState {
	operation: DatabaseOperationAst
}

interface ActiveNestedWrite {
	readonly coordinator: RuntimeNestedWriteCoordinator
	readonly graph: NestedWriteGraph
	readonly node: NestedWriteObjectNode
}

/** Retains the latest immutable AST for transaction error attribution. */
const retainExecutionOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	execution: RuntimePipelineExecutionState,
	operation: TOperation,
): TOperation => {
	execution.operation = operation

	return operation
}

/**
 * Executes every operation through one fixed security and transaction order.
 * Framework errors intentionally cross this boundary unchanged for transports.
 */
export class RuntimePipeline {
	readonly #stages: Readonly<RuntimePipelineStages>
	readonly #resultBoundaries = createRuntimeBehaviorBoundaries()
	readonly #inclusionProjector: RuntimeInclusionProjector

	constructor(stages: RuntimePipelineStages) {
		assertRuntimePipelineStages(stages)
		const enforcement =
			stages.enforcement === undefined
				? undefined
				: immutableRecord(stages.enforcement)
		const behaviors =
			stages.behaviors === undefined
				? undefined
				: immutableRecord(stages.behaviors)

		this.#stages = immutableRecord({
			...stages,
			...(behaviors === undefined ? {} : { behaviors }),
			...(enforcement === undefined ? {} : { enforcement }),
		})
		this.#inclusionProjector = new RuntimeInclusionProjector(
			this.#stages,
			this.#resultBoundaries,
		)
		retainRuntimeMutationBatchProjector(this, (request) =>
			this.#inclusionProjector.projectMutationBatch(
				request,
				createRuntimeVirtualFieldScheduler(this),
			),
		)

		// Pipeline configuration cannot change after application initialization.
		Object.freeze(this)
	}

	/**
	 * Reuses every enforcement and behavior stage with one isolated transaction adapter.
	 * Per-operation post-commit effects remain deferred until the outer commit.
	 */
	async beginTransaction(): Promise<RuntimePipelineTransactionScope> {
		const scope = await beginPipelineTransaction(
			this.#stages,
			(stages) => new RuntimePipeline(stages),
		)
		inheritRuntimeNestedWrites(this, scope.pipeline)
		inheritRuntimeVirtualFields(this, scope.pipeline)
		return scope
	}

	async execute<const TOperation extends DatabaseOperationAst>(
		request: RuntimePipelineRequest<TOperation>,
	): Promise<RuntimeOperationResult<TOperation>> {
		const untrustedRequest: unknown = request

		if (!isPlainRecord(untrustedRequest)) {
			throw new TypeError('Runtime pipeline request must be a plain object')
		}

		if (!(untrustedRequest.context instanceof RequestContext)) {
			throw new TypeError('Runtime pipeline context must be a RequestContext')
		}

		if (
			request.protectedPolicyDeniedAsMissing === true &&
			request.operation.kind !== 'find-one' &&
			request.operation.kind !== 'get' &&
			request.operation.kind !== 'exists' &&
			request.operation.kind !== 'update-one' &&
			request.operation.kind !== 'delete-one'
		) {
			throw new TypeError(
				'Runtime protectedPolicyDeniedAsMissing requires a singular protected operation',
			)
		}

		const context: RequestContext = request.context
		throwIfOperationCancelled(context.signal, {
			operationKind: request.operation.kind,
			phase: 'pipeline-start',
		})
		const execution: RuntimePipelineExecutionState = {
			operation: request.operation,
		}
		const virtualScheduler = createRuntimeVirtualFieldScheduler(this)

		try {
			const nestedMarker = readNestedWriteRootOperation(request.operation)
			if (nestedMarker !== undefined) {
				if (
					(request.operation.kind !== 'create-one' ||
						nestedMarker.command !== 'create') &&
					(request.operation.kind !== 'update-one' ||
						nestedMarker.command !== 'update')
				) {
					throw new TypeError(
						'Runtime nested-write marker does not match its root operation',
					)
				}
				const binding = readRuntimeNestedWrites(this)
				if (binding === undefined) {
					throw new TypeError('Runtime nested writes are not application-bound')
				}
				const graph = prepareRuntimeNestedWriteGraph(
					request.operation as unknown as
						| CreateOneOperationAst<SchemaDefinition>
						| UpdateOneOperationAst<SchemaDefinition>,
					nestedMarker,
					binding,
				)
				const rootOperation =
					request.operation.kind === 'create-one'
						? createRuntimeNestedCreateOperation(
								request.operation as unknown as CreateOneOperationAst<SchemaDefinition>,
								graph.root,
							)
						: createRuntimeNestedUpdateOperation(
								request.operation as unknown as UpdateOneOperationAst<SchemaDefinition>,
								graph.root,
							)
				const host = createRuntimeNestedWriteHost(
					binding,
					context,
					graph,
					this.#stages,
					{
						execute: async (operation, rowFilter, denied, nested, relation) => {
							try {
								return await this.#executeOperation(
									immutableRecord({
										context,
										operation,
										...(rowFilter === undefined ? {} : { rowFilter }),
										...(denied === undefined
											? {}
											: { protectedPolicyDeniedAsMissing: denied }),
										...(relation === undefined ? {} : { relation }),
									}),
									{ operation },
									nested,
									virtualScheduler,
								)
							} catch (error: unknown) {
								if (denied === true && isProtectedPolicyDenied(error)) {
									throw createProtectedObjectNotFoundError()
								}
								throw error
							}
						},
					},
					() => coordinator,
				)
				const coordinator = new RuntimeNestedWriteCoordinator(graph, host)
				const nested = immutableRecord({
					coordinator,
					graph,
					node: graph.root,
				})

				const result = await runWithRuntimeNestedWriteStageContext(
					createRuntimeNestedWriteStageContext(graph, graph.root),
					() =>
						this.#executeOperation(
							immutableRecord({ ...request, operation: rootOperation }),
							execution,
							nested,
							virtualScheduler,
						),
				)

				return result as unknown as RuntimeOperationResult<TOperation>
			}

			return await runWithRuntimeNestedWriteStageContext(undefined, () =>
				this.#executeOperation(request, execution, undefined, virtualScheduler),
			)
		} catch (error: unknown) {
			if (
				request.protectedPolicyDeniedAsMissing === true &&
				isProtectedPolicyDenied(error)
			) {
				if (
					request.operation.kind !== 'find-one' &&
					request.operation.kind !== 'exists'
				) {
					throw createProtectedObjectNotFoundError()
				}

				const missingResult = request.operation.kind === 'exists' ? false : null

				return missingResult as RuntimeOperationResult<TOperation>
			}

			throw error
		}
	}

	/** Executes a structurally trusted request while the public method owns failures. */
	async #executeOperation<const TOperation extends DatabaseOperationAst>(
		request: RuntimePipelineRequest<TOperation>,
		execution: RuntimePipelineExecutionState,
		nested?: ActiveNestedWrite,
		virtualScheduler?: RuntimeVirtualFieldScheduler,
	): Promise<RuntimeOperationResult<TOperation>> {
		const context: RequestContext = request.context
		const privateRowFilter =
			request.rowFilter === undefined
				? undefined
				: normalizeLogicalFilter(request.rowFilter)
		const privateRelation = request.relation
		let operation: TOperation = request.operation

		const reservedCreateId = readReservedCreateId(operation)
		operation = await this.#stages.normalization(
			createRuntimeOperationInput(context, operation),
		)
		if (reservedCreateId !== undefined) {
			operation = retainReservedCreateId(operation, reservedCreateId)
		}
		operation = retainExecutionOperation(
			execution,
			await this.#stages.structuralValidation(
				createRuntimeOperationInput(context, operation),
			),
		)

		let enforcement: EnforcementState | undefined
		let constraints: readonly DatabaseConstraintNode[] = emptyRuntimeConstraints
		let rowFilter: DatabaseRowFilterNode | undefined = privateRowFilter
		let relationPredicates:
			readonly DatabaseRelationPredicateScope[] | undefined

		if (this.#stages.enforcement !== undefined) {
			if (
				privateRelation !== undefined &&
				!isRuntimeMutationOperation(operation) &&
				this.#stages.enforcement.enforceRelationRead !== undefined
			) {
				await this.#stages.enforcement.enforceRelationRead(
					immutableRecord({
						context,
						operation,
						relation: privateRelation,
					}),
				)
			}

			enforcement = await this.#stages.enforcement.evaluate(
				createRuntimeOperationInput(context, operation),
			)
			const enforced: RuntimeEnforcementOperationResult<TOperation> =
				await this.#stages.enforcement.enforceOperation(
					createRuntimeEnforcementInput(context, operation, enforcement),
				)

			operation = retainExecutionOperation(execution, enforced.operation)
			constraints = snapshotRuntimeConstraints(enforced.constraints)
			rowFilter = combineDatabaseRowFilters(
				privateRowFilter,
				enforced.rowFilter,
			)
			relationPredicates = enforced.relationPredicates
		}

		const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
			operation,
			virtualScheduler,
		)
		const inclusions = await this.#inclusionProjector.prepare(
			context,
			operation,
		)

		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'database-operation',
		})

		const databaseExecution = await executeRuntimeDatabaseOperation(
			this.#stages.databaseOperation,
			context,
			this.#stages.behaviors,
			this.#stages.persistencePlanRewrite,
			immutableRecord({
				constraints,
				operation,
				...(request.protectedPolicyDeniedAsMissing === true
					? { strictTarget: true as const }
					: {}),
				...(inclusions.length === 0
					? {}
					: {
							inclusions: immutableArray(
								inclusions.map(({ database }) => database),
							),
						}),
				...(privateRelation === undefined ? {} : { relation: privateRelation }),
				...(relationPredicates === undefined ? {} : { relationPredicates }),
				...(rowFilter === undefined ? {} : { rowFilter }),
				...(virtualProjection === undefined
					? {}
					: { returningSelection: virtualProjection.persistedSelection }),
			}),
			this.#stages.finalMutationValidation,
			this.#stages.enforcement,
			enforcement,
			nested === undefined
				? undefined
				: {
						beforeMutationResolution: (resolvedOperation, target) =>
							nested.coordinator.beforeMutation(
								nested.node,
								resolvedOperation,
								target,
							),
						afterMutationResolution: (resolvedOperation) => {
							nested.coordinator.assertResolvedMutation(
								nested.node,
								resolvedOperation,
							)
						},
						afterMutationOutcome: (outcome) =>
							nested.coordinator.afterMutation(
								nested.node,
								readNestedMutationOutcomeId(outcome, nested.node.command),
							),
					},
		)
		enforcement = databaseExecution.enforcement ?? enforcement
		operation = retainExecutionOperation(execution, databaseExecution.operation)
		if (operation.kind === 'get' && databaseExecution.result === null) {
			throw createProtectedObjectNotFoundError()
		}
		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'database-operation',
		})
		const virtualResults = prepareRuntimeVirtualDatabaseResult(
			this.#resultBoundaries,
			operation,
			virtualProjection,
			databaseExecution.result,
		)
		const privateDatabaseResult = virtualResults.privateResult
		let databaseResult: DatabaseOperationResult<TOperation> =
			virtualResults.publicResult
		const selectedFieldsOverride = readRuntimeSelectedFieldsOverride(
			operation,
			enforcement,
		)
		if (this.#stages.enforcement !== undefined && enforcement !== undefined) {
			databaseResult = await this.#stages.enforcement.enforceSelectionResult(
				immutableRecord({
					context,
					enforcement,
					operation,
					result: databaseResult,
				}),
			)
		}
		// Policy projection precedes validation so over-fetching adapters cannot
		// expose or invalidate fields that product output behaviors may not observe.
		databaseResult = this.#resultBoundaries.snapshotDatabaseResultReplacement(
			operation,
			databaseResult,
			selectedFieldsOverride,
		)

		if (this.#stages.behaviors?.transformDatabaseResult !== undefined) {
			databaseResult = await this.#stages.behaviors.transformDatabaseResult(
				createRuntimeProjectedDatabaseResultInput(
					context,
					operation,
					databaseResult,
					selectedFieldsOverride,
				),
			)
		}

		let result: RuntimeOperationResult<TOperation> =
			await this.#inclusionProjector.hydrate(
				context,
				operation,
				databaseResult,
				databaseExecution.inclusionSource ?? databaseExecution.result,
				inclusions,
				virtualScheduler,
			)
		// Identity follows exact records through result behaviors instead of being
		// reassociated by an unstable final collection index.
		retainRuntimeSchemaModelMetadata(
			operation,
			databaseExecution.objectIdentities,
			result,
			readRuntimeSchemaModelSelectedFields(operation, selectedFieldsOverride),
		)
		if (virtualProjection !== undefined && virtualScheduler !== undefined) {
			result = await virtualScheduler.resolve(
				context,
				operation,
				virtualProjection,
				result,
				privateDatabaseResult,
			)
		}

		if (this.#stages.behaviors?.transformResult !== undefined) {
			result = await this.#stages.behaviors.transformResult(
				createRuntimeMaterializedResultInput(
					context,
					operation,
					result,
					selectedFieldsOverride,
					databaseExecution.outcome,
				),
			)
		}

		// Every product behavior shares the same strict result boundary.
		result = this.#resultBoundaries.snapshotResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		)

		if (this.#stages.enforcement !== undefined && enforcement !== undefined) {
			result = await this.#stages.enforcement.enforceResult<TOperation>(
				createRuntimeEnforcementResultInput(
					context,
					operation,
					result,
					enforcement,
				),
			)
		}
		const completedOperation: RuntimeResultStageInput<TOperation> =
			createRuntimeResultInput(context, operation, result)

		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'commit',
		})
		await this.#stages.commit(completedOperation)
		if (this.#stages.behaviors?.postCommit !== undefined) {
			await this.#stages.behaviors.postCommit(completedOperation)
		}
		execution.operation = operation
		return result
	}
}
