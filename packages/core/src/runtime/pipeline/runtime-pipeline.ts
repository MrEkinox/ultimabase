import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import { RequestContext } from '../context/request-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseOperationAst,
	DatabaseOperationResult,
	DatabaseRelationPredicateScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { createRuntimeHookBoundaries } from '../hooks/boundaries.js'
import { throwIfOperationCancelled } from '../hooks/cancellation.js'
import { retainRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	beginPipelineTransaction,
	type RuntimePipelineTransactionScope,
} from '../transactions/pipeline-transaction.js'
import type {
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementStages,
	RuntimeNativeHookStages,
	RuntimeOperationResult,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultStageInput,
} from './contracts.js'
import {
	executeRuntimeDatabaseOperation,
	isRuntimeMutationOperation,
} from './database-execution.js'
import {
	isRuntimeNativeAccessDenied,
	retainRuntimeMutationBatchProjector,
	RuntimeInclusionProjector,
} from './inclusion-projection.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeEnforcementResultInput,
	createRuntimeNativeDatabaseResultInput,
	createRuntimeNativeResultInput,
	createRuntimeOperationInput,
	createRuntimeResultInput,
	emptyRuntimeConstraints,
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
	snapshotRuntimeConstraints,
} from './stage-inputs.js'

export { projectRuntimeMutationBatch } from './inclusion-projection.js'
export type { RuntimeMutationBatchProjectionRequest } from './inclusion-projection.js'

const functionStageNames = [
	'normalization',
	'structuralValidation',
	'globalBeforeHooks',
	'schemaBeforeHooks',
	'schemaAfterHooks',
	'globalAfterHooks',
	'commit',
	'postCommitEvents',
] as const satisfies readonly (keyof RuntimePipelineStages)[]

const enforcementStageNames = [
	'enforceOperation',
	'enforceResult',
	'enforceSelectionResult',
	'evaluate',
	'reevaluate',
] as const satisfies readonly (keyof RuntimeEnforcementStages)[]

const nativeHookStageNames = [
	'mutationOutcome',
	'requiresPreparedMutationItems',
	'resolveInput',
	'schemaResolveInput',
	'resolveOutput',
	'revalidate',
	'schemaAfter',
	'schemaPrepared',
] as const satisfies readonly (keyof RuntimeNativeHookStages)[]

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

/** Carries only mutable orchestration state that never crosses a hook boundary. */
interface RuntimePipelineExecutionState {
	operation: DatabaseOperationAst
}

/** Rejects incomplete JavaScript assembly before an operation can start. */
const assertRuntimePipelineStages = (stages: RuntimePipelineStages): void => {
	const untrustedStages: unknown = stages

	if (!isPlainRecord(untrustedStages)) {
		throw new TypeError('Runtime pipeline stages must be a plain object')
	}

	for (const stageName of functionStageNames) {
		if (typeof untrustedStages[stageName] !== 'function') {
			throw new TypeError(
				`Runtime pipeline stage ${stageName} must be a function`,
			)
		}
	}

	const nativeHooks: unknown = untrustedStages.nativeHooks

	if (nativeHooks !== undefined) {
		if (!isPlainRecord(nativeHooks)) {
			throw new TypeError('Runtime pipeline nativeHooks must be a plain object')
		}

		for (const stageName of nativeHookStageNames) {
			if (typeof nativeHooks[stageName] !== 'function') {
				throw new TypeError(
					`Runtime native hook stage ${stageName} must be a function`,
				)
			}
		}
	}

	const enforcement: unknown = untrustedStages.enforcement

	if (enforcement !== undefined) {
		if (!isPlainRecord(enforcement)) {
			throw new TypeError('Runtime pipeline enforcement must be a plain object')
		}

		for (const stageName of enforcementStageNames) {
			if (typeof enforcement[stageName] !== 'function') {
				throw new TypeError(
					`Runtime enforcement stage ${stageName} must be a function`,
				)
			}
		}

		for (const stageName of [
			'enforceMutationOutcome',
			'enforcePreparedMutation',
			'enforceRelationRead',
		] as const) {
			if (
				enforcement[stageName] !== undefined &&
				typeof enforcement[stageName] !== 'function'
			) {
				throw new TypeError(
					`Runtime enforcement stage ${stageName} must be a function`,
				)
			}
		}
	}

	const databaseOperation: unknown = untrustedStages.databaseOperation

	if (
		typeof databaseOperation !== 'object' ||
		databaseOperation === null ||
		!('execute' in databaseOperation) ||
		typeof databaseOperation.execute !== 'function'
	) {
		throw new TypeError(
			'Runtime pipeline databaseOperation must be an operation executor',
		)
	}

	if (
		untrustedStages.preparedOperationHooks !== undefined &&
		typeof untrustedStages.preparedOperationHooks !== 'function'
	) {
		throw new TypeError(
			'Runtime pipeline stage preparedOperationHooks must be a function',
		)
	}
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
	readonly #resultBoundaries = createRuntimeHookBoundaries()
	readonly #inclusionProjector: RuntimeInclusionProjector

	constructor(stages: RuntimePipelineStages) {
		assertRuntimePipelineStages(stages)
		const nativeHooks =
			stages.nativeHooks === undefined
				? undefined
				: immutableRecord(stages.nativeHooks)

		const enforcement =
			stages.enforcement === undefined
				? undefined
				: immutableRecord(stages.enforcement)

		this.#stages = immutableRecord({
			...stages,
			...(nativeHooks === undefined ? {} : { nativeHooks }),
			...(enforcement === undefined ? {} : { enforcement }),
		})
		this.#inclusionProjector = new RuntimeInclusionProjector(
			this.#stages,
			this.#resultBoundaries,
		)
		retainRuntimeMutationBatchProjector(this, (request) =>
			this.#inclusionProjector.projectMutationBatch(request),
		)

		// Pipeline configuration cannot change after application initialization.
		Object.freeze(this)
	}

	/**
	 * Reuses every security and hook stage with one isolated transaction adapter.
	 * Per-operation post-commit effects remain deferred until the outer commit.
	 */
	async beginTransaction(): Promise<RuntimePipelineTransactionScope> {
		return beginPipelineTransaction(
			this.#stages,
			(stages) => new RuntimePipeline(stages),
		)
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
			request.nativeAccessDeniedAsMissing === true &&
			request.operation.kind !== 'find-one' &&
			request.operation.kind !== 'get' &&
			request.operation.kind !== 'exists' &&
			request.operation.kind !== 'update-one' &&
			request.operation.kind !== 'delete-one'
		) {
			throw new TypeError(
				'Runtime nativeAccessDeniedAsMissing requires a singular protected operation',
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

		try {
			return await this.#executeOperation(request, execution)
		} catch (error: unknown) {
			if (
				request.nativeAccessDeniedAsMissing === true &&
				isRuntimeNativeAccessDenied(error)
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
	): Promise<RuntimeOperationResult<TOperation>> {
		const context: RequestContext = request.context
		const privateRowFilter =
			request.rowFilter === undefined
				? undefined
				: normalizeLogicalFilter(request.rowFilter)
		const privateRelation = request.relation
		let operation: TOperation = request.operation

		operation = await this.#stages.normalization(
			createRuntimeOperationInput(context, operation),
		)
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
			this.#stages.nativeHooks,
			this.#stages.preparedOperationHooks,
			this.#stages.globalBeforeHooks,
			this.#stages.schemaBeforeHooks,
			immutableRecord({
				constraints,
				operation,
				...(request.nativeAccessDeniedAsMissing === true
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
			}),
			this.#stages.enforcement,
			enforcement,
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
		let databaseResult: DatabaseOperationResult<TOperation> =
			databaseExecution.result
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
		// expose or invalidate fields that business output hooks may not observe.
		databaseResult = this.#resultBoundaries.snapshotDatabaseResultReplacement(
			operation,
			databaseResult,
			selectedFieldsOverride,
		)

		if (this.#stages.nativeHooks !== undefined) {
			databaseResult = await this.#stages.nativeHooks.resolveOutput(
				createRuntimeNativeDatabaseResultInput(
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
			)
		// Identity follows exact records through result hooks instead of being
		// reassociated by an unstable final collection index.
		retainRuntimeSchemaModelMetadata(
			operation,
			databaseExecution.objectIdentities,
			result,
			readRuntimeSchemaModelSelectedFields(operation, selectedFieldsOverride),
		)

		if (this.#stages.nativeHooks !== undefined) {
			result = await this.#stages.nativeHooks.schemaAfter(
				createRuntimeNativeResultInput(
					context,
					operation,
					result,
					selectedFieldsOverride,
					databaseExecution.outcome,
				),
			)
		}

		result = await this.#stages.schemaAfterHooks(
			createRuntimeResultInput(context, operation, result),
		)
		result = await this.#stages.globalAfterHooks(
			createRuntimeResultInput(context, operation, result),
		)
		// Legacy low-level result hooks share the same strict boundary as native hooks.
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
		await this.#stages.postCommitEvents(completedOperation)
		execution.operation = operation
		return result
	}
}
