import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	type DatabaseConstraintNode,
	type DatabaseInclusionPlan,
	type DatabaseMutationLogicalRecord,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationOutcome,
	type DatabaseOperationResult,
	type DatabaseRelationPredicateScope,
	type DatabaseRelationScope,
	type DatabaseRowFilterNode,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '../database/contracts.js'
import type { RuntimePersistencePlanRewriteStage } from '../persistence/contracts.js'
import {
	assertPersistencePlanCapability,
	compileDatabasePersistencePlan,
} from '../persistence/execution.js'
import { createDatabasePersistencePlan } from '../persistence/plans.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { RequestContext } from '../context/request-context.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { collectDatabaseObjectIdentities } from '../operations/model-metadata.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type {
	RuntimeBehaviorStages,
	RuntimeEnforcementStages,
	RuntimeMutationRevalidationStage,
} from './contracts.js'
import { loadSingularMutationInclusionSource } from './inclusion-projection.js'
import { assertDatabaseRequestCapabilities } from './database-capability-validation.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeMutationOutcomeInput,
	createRuntimeMutationRevalidationInput,
	createRuntimeOperationInput,
	createRuntimePreparedMutationInput,
	snapshotRuntimeConstraints,
} from './stage-inputs.js'
import { isRuntimeMutationOperation } from './operation-kind.js'

export interface RuntimeDatabaseExecution<
	TOperation extends DatabaseOperationAst,
> {
	readonly enforcement?: EnforcementState
	/** Retains the adapter-owned source row that carries eager relationship values. */
	readonly inclusionSource?: DatabaseOperationResult<TOperation>
	readonly objectIdentities: readonly unknown[]
	readonly operation: TOperation
	readonly outcome?: DatabaseOperationOutcome<DatabaseMutationOperationAst>
	readonly result: DatabaseOperationResult<TOperation>
}

/** Rejects mutation execution that escaped the mandatory transaction scope. */
const assertPreparedMutationExecutor: (
	executor: DatabaseOperationExecutor,
) => asserts executor is DatabaseTransactionAdapter = (executor) => {
	const untrustedExecutor: unknown = executor

	if (
		typeof untrustedExecutor !== 'object' ||
		untrustedExecutor === null ||
		!('kind' in untrustedExecutor) ||
		untrustedExecutor.kind !== 'database-transaction-adapter' ||
		!('prepare' in untrustedExecutor) ||
		typeof untrustedExecutor.prepare !== 'function'
	) {
		throw new TypeError(
			'Runtime mutation requires a prepared database transaction adapter',
		)
	}
}

/** Reads the conditional prepared target through one validated erased boundary. */
const readPreparedMutationTarget = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	prepared: PreparedDatabaseOperation<TOperation>,
): DatabaseMutationLogicalRecord<TOperation> | null | undefined => {
	const untrustedPrepared: unknown = prepared

	if (typeof untrustedPrepared !== 'object' || untrustedPrepared === null) {
		throw new TypeError('Prepared database operation must be an object')
	}

	const value: unknown =
		'target' in untrustedPrepared ? untrustedPrepared.target : undefined

	if (value === undefined || value === null) return value

	if (!isPlainRecord(value)) {
		throw new TypeError('Prepared database target must be a logical record')
	}

	// The adapter contract ties this validated logical record to the operation schema.
	return value as DatabaseMutationLogicalRecord<TOperation>
}

/** Reads optional stable set-based preimages through one validated boundary. */
const readPreparedMutationTargets = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	prepared: PreparedDatabaseOperation<TOperation>,
): readonly DatabaseMutationLogicalRecord<TOperation>[] | undefined => {
	const untrustedPrepared: unknown = prepared

	if (typeof untrustedPrepared !== 'object' || untrustedPrepared === null) {
		throw new TypeError('Prepared database operation must be an object')
	}

	const value: unknown =
		'targets' in untrustedPrepared ? untrustedPrepared.targets : undefined

	if (value === undefined) return undefined

	if (
		!isUnknownArray(value) ||
		value.some((target) => !isPlainRecord(target))
	) {
		throw new TypeError(
			'Prepared database targets must be an array of logical records',
		)
	}

	return immutableArray(
		value,
	) as readonly DatabaseMutationLogicalRecord<TOperation>[]
}

export interface RuntimeDatabaseExecutionRequest<
	TOperation extends DatabaseOperationAst,
> {
	readonly constraints: readonly DatabaseConstraintNode[]
	readonly operation: TOperation
	readonly strictTarget?: true
	readonly inclusions?: readonly DatabaseInclusionPlan[]
	readonly relation?: DatabaseRelationScope
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	readonly rowFilter?: DatabaseRowFilterNode
}

/** Interleaves Core-owned graph work without storing callbacks in the graph. */
export interface RuntimeMutationExecutionLifecycle {
	afterMutationOutcome(outcome: unknown): Promise<void>
	afterMutationResolution(operation: DatabaseMutationOperationAst): void
	beforeMutationResolution(): Promise<void>
}

/** Owns adapter reads and prepared writes behind one immutable result envelope. */
export const executeRuntimeDatabaseOperation = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	context: RequestContext,
	behaviors: RuntimeBehaviorStages | undefined,
	persistencePlanRewrite: RuntimePersistencePlanRewriteStage | undefined,
	request: RuntimeDatabaseExecutionRequest<TOperation>,
	finalMutationValidation: RuntimeMutationRevalidationStage,
	enforcement: RuntimeEnforcementStages | undefined,
	enforcementState: EnforcementState | undefined,
	nestedLifecycle?: RuntimeMutationExecutionLifecycle,
): Promise<RuntimeDatabaseExecution<TOperation>> => {
	assertDatabaseRequestCapabilities(executor, request)
	if (!isRuntimeMutationOperation(request.operation)) {
		if (behaviors?.beforeOperation !== undefined) {
			await behaviors.beforeOperation(
				createRuntimeOperationInput(context, request.operation),
			)
		}
		const plan = await compileDatabasePersistencePlan(
			executor,
			request.operation,
			persistencePlanRewrite,
		)
		const result = await executor.execute(immutableRecord({ ...request, plan }))

		return immutableRecord({
			...(enforcementState === undefined
				? {}
				: { enforcement: enforcementState }),
			objectIdentities: collectDatabaseObjectIdentities(
				executor,
				request.operation,
				result,
			),
			operation: request.operation,
			result,
		})
	}

	assertPreparedMutationExecutor(executor)
	type TMutationOperation = TOperation & DatabaseMutationOperationAst
	// The operation-kind guard above narrows the generic request to its mutation branch.
	const initialOperation: TMutationOperation = request.operation
	let executableOperation: TMutationOperation = initialOperation
	let operationTransformed = false
	let finalConstraints = request.constraints
	const prepareMutationItems =
		behaviors?.requiresPreparedMutationItems?.(request.operation) === true ||
		enforcement?.requiresPreparedMutationItems?.(request.operation) === true ||
		(persistencePlanRewrite !== undefined &&
			request.operation.kind === 'delete-many')
	const prepareMutation = async (
		operation: TMutationOperation,
		constraints: readonly DatabaseConstraintNode[],
	): Promise<PreparedDatabaseOperation<TMutationOperation>> => {
		const plan = createDatabasePersistencePlan(operation)
		assertPersistencePlanCapability(executor, plan)
		return executor.prepare(
			immutableRecord({
				constraints,
				operation,
				plan,
				...(prepareMutationItems
					? { prepareMutationItems: true as const }
					: {}),
				...(request.inclusions === undefined
					? {}
					: { inclusions: request.inclusions }),
				...(request.relation === undefined
					? {}
					: { relation: request.relation }),
				...(request.relationPredicates === undefined
					? {}
					: { relationPredicates: request.relationPredicates }),
				...(request.rowFilter === undefined
					? {}
					: { rowFilter: request.rowFilter }),
			}),
		)
	}
	const resolveMutationInput = async (
		target:
			DatabaseMutationLogicalRecord<TMutationOperation> | null | undefined,
		targets:
			readonly DatabaseMutationLogicalRecord<TMutationOperation>[] | undefined,
	): Promise<void> => {
		if (
			behaviors?.transformInput !== undefined &&
			executableOperation.kind !== 'delete-one' &&
			executableOperation.kind !== 'delete-many'
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await behaviors.transformInput(
				createRuntimeOperationInput(context, executableOperation),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		if (
			behaviors?.transformPreparedInput !== undefined &&
			(executableOperation.kind === 'create-one' ||
				executableOperation.kind === 'update-one' ||
				executableOperation.kind === 'upsert-one') &&
			!(executableOperation.kind === 'update-one' && target === null)
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await behaviors.transformPreparedInput(
				createRuntimePreparedMutationInput(
					context,
					operationBeforeResolution,
					executableOperation.kind === 'create-one' ? null : target,
					targets,
				),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		if (
			target !== undefined &&
			target !== null &&
			behaviors?.transformPreparedOperation !== undefined
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await behaviors.transformPreparedOperation(
				createRuntimePreparedMutationInput(
					context,
					operationBeforeResolution,
					target,
					undefined,
				),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		executableOperation = await finalMutationValidation(
			createRuntimeMutationRevalidationInput(
				context,
				initialOperation,
				executableOperation,
				target,
				targets,
			),
		)

		if (behaviors?.guardMutationInput !== undefined) {
			throwIfOperationCancelled(context.signal, {
				operationKind: executableOperation.kind,
				phase: 'final-mutation-input-guard',
			})
			await behaviors.guardMutationInput(
				createRuntimePreparedMutationInput(
					context,
					executableOperation,
					target,
					targets,
				),
			)
			throwIfOperationCancelled(context.signal, {
				operationKind: executableOperation.kind,
				phase: 'final-mutation-input-guard',
			})
		}

		if (
			operationTransformed &&
			enforcement !== undefined &&
			enforcementState !== undefined
		) {
			enforcementState = await enforcement.reevaluate(
				createRuntimeEnforcementInput(
					context,
					executableOperation,
					enforcementState,
				),
			)
			const enforced = await enforcement.enforceOperation(
				createRuntimeEnforcementInput(
					context,
					executableOperation,
					enforcementState,
				),
			)
			executableOperation = enforced.operation
			finalConstraints = snapshotRuntimeConstraints(enforced.constraints)
		}

		if (
			operationTransformed &&
			enforcement?.enforcePreparedMutation !== undefined &&
			enforcementState !== undefined
		) {
			await enforcement.enforcePreparedMutation(
				createRuntimePreparedMutationInput(
					context,
					executableOperation,
					target,
					targets,
				),
			)
		}
	}
	const runMutationObservers = async (
		target:
			DatabaseMutationLogicalRecord<TMutationOperation> | null | undefined,
		targets:
			readonly DatabaseMutationLogicalRecord<TMutationOperation>[] | undefined,
	): Promise<void> => {
		if (behaviors?.beforeOperation !== undefined) {
			await behaviors.beforeOperation(
				createRuntimeOperationInput(context, executableOperation),
			)
		}

		if (
			behaviors?.observePreparedMutation !== undefined &&
			!(
				(executableOperation.kind === 'update-one' ||
					executableOperation.kind === 'delete-one') &&
				target === null
			)
		) {
			await behaviors.observePreparedMutation(
				createRuntimePreparedMutationInput(
					context,
					executableOperation,
					target,
					targets,
				),
			)
		}
	}
	const preparesAfterResolution =
		executableOperation.kind === 'create-one' ||
		executableOperation.kind === 'create-many'
	let prepared: PreparedDatabaseOperation<TMutationOperation>
	let target:
		DatabaseMutationLogicalRecord<TMutationOperation> | null | undefined
	let targets:
		readonly DatabaseMutationLogicalRecord<TMutationOperation>[] | undefined

	await nestedLifecycle?.beforeMutationResolution()

	if (preparesAfterResolution) {
		await resolveMutationInput(undefined, undefined)
		nestedLifecycle?.afterMutationResolution(executableOperation)
		await runMutationObservers(undefined, undefined)
		prepared = await prepareMutation(executableOperation, finalConstraints)
		target = readPreparedMutationTarget(prepared)
		targets = readPreparedMutationTargets(prepared)
	} else {
		prepared = await prepareMutation(executableOperation, finalConstraints)
		target = readPreparedMutationTarget(prepared)
		targets = readPreparedMutationTargets(prepared)
	}

	const requiresPreparedTarget =
		executableOperation.kind === 'update-one' ||
		executableOperation.kind === 'delete-one'
	const requiresExposedTarget =
		requiresPreparedTarget || executableOperation.kind === 'upsert-one'

	if (requiresExposedTarget && target === undefined) {
		throw new TypeError(
			'Prepared directed mutation must expose its complete target',
		)
	}

	if (
		prepareMutationItems &&
		(executableOperation.kind === 'update-many' ||
			executableOperation.kind === 'delete-many') &&
		targets === undefined
	) {
		throw new TypeError(
			'Prepared set-based mutation must expose its complete targets',
		)
	}

	if (
		requiresPreparedTarget &&
		target === null &&
		request.strictTarget === true
	) {
		throw createProtectedObjectNotFoundError()
	}

	if (!preparesAfterResolution) {
		if (
			enforcement?.enforcePreparedMutation !== undefined &&
			enforcementState !== undefined
		) {
			await enforcement.enforcePreparedMutation(
				createRuntimePreparedMutationInput(
					context,
					executableOperation,
					target,
					targets,
				),
			)
		}

		await resolveMutationInput(target, targets)
		nestedLifecycle?.afterMutationResolution(executableOperation)
		await runMutationObservers(target, targets)
	}
	const persistencePlan = await compileDatabasePersistencePlan(
		executor,
		executableOperation,
		persistencePlanRewrite,
	)
	let outcome = await prepared.execute(
		immutableRecord({
			constraints: finalConstraints,
			operation: executableOperation,
			plan: persistencePlan,
		}),
	)

	if (
		enforcement?.enforceMutationOutcome !== undefined &&
		enforcementState !== undefined
	) {
		outcome = await enforcement.enforceMutationOutcome(
			createRuntimeMutationOutcomeInput(context, executableOperation, outcome),
		)
	}

	if (behaviors?.transformMutationOutcome !== undefined) {
		outcome = await behaviors.transformMutationOutcome(
			createRuntimeMutationOutcomeInput(context, request.operation, outcome),
		)
	}
	await nestedLifecycle?.afterMutationOutcome(outcome)
	const inclusionSource = await loadSingularMutationInclusionSource(
		executor,
		executableOperation,
		outcome,
		request.inclusions,
	)

	return immutableRecord({
		...(enforcementState === undefined
			? {}
			: { enforcement: enforcementState }),
		...(inclusionSource === undefined ? {} : { inclusionSource }),
		objectIdentities: collectDatabaseObjectIdentities(
			executor,
			request.operation,
			outcome.result,
			outcome,
		),
		outcome,
		operation: executableOperation,
		// With eager loading, the transaction-bound get is the authoritative result.
		result: inclusionSource ?? outcome.result,
	})
}
