import { immutableRecord } from '@ultimabase/shared'

import type {
	DatabaseInclusionPlan,
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
	DatabaseRelationPredicateScope,
	DatabaseRelationScope,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import type { QuerySelectionNode } from '../../query/index.js'
import type { RuntimePersistencePlanRewriteStage } from '../persistence/contracts.js'
import {
	assertPersistencePlanCapability,
	compileDatabasePersistencePlan,
} from '../persistence/execution.js'
import { createDatabasePersistencePlanWithSelection } from '../persistence/plans.js'
import { readRewrittenDeleteResult } from '../persistence/rewritten-delete-result.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { RequestContext } from '../context/request-context.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { readRuntimePreparedMutationRecords } from '../behaviors/prepared-target-boundary.js'
import { collectDatabaseObjectIdentities } from '../operations/model-metadata.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import { readOperationResultSelection } from '../operations/queries.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type {
	RuntimeBehaviorStages,
	RuntimeEnforcementStages,
	RuntimeMutationRevalidationStage,
	RuntimeMutationValidationIssue,
} from './contracts.js'
import { loadSingularMutationInclusionSource } from './mutation-inclusion-source.js'
import { assertDatabaseRequestCapabilities } from './database-capability-validation.js'
import {
	readValidationErrorIssues,
	throwMergedValidationIssues,
} from '../validation/validation-issues.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeOperationInput,
	createRuntimePreparedMutationInput,
	createRuntimeStageInput,
} from './stage-inputs.js'

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

export interface RuntimeDatabaseExecutionRequest<
	TOperation extends DatabaseOperationAst,
> {
	readonly operation: TOperation
	readonly strictTarget?: true
	readonly inclusions?: readonly DatabaseInclusionPlan[]
	readonly relation?: DatabaseRelationScope
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	readonly rowFilter?: DatabaseRowFilterNode
	/** Supplies the private persisted result projection without changing logical behavior input. */
	readonly returningSelection?: QuerySelectionNode
	/** Checks a delete's locked pre-image against the row read rules (ADR-0306). */
	readonly assertReadableTargets?: (ids: readonly string[]) => Promise<void>
}

/** Interleaves Core-owned graph work without storing callbacks in the graph. */
interface RuntimeMutationExecutionLifecycle {
	afterMutationOutcome(outcome: unknown): Promise<void>
	afterMutationResolution(operation: DatabaseMutationOperationAst): void
	beforeMutationResolution(
		operation: DatabaseMutationOperationAst,
		target: Readonly<Record<string, unknown>> | null | undefined,
	): Promise<DatabaseMutationOperationAst>
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
	const retainedEnforcement = () =>
		enforcementState === undefined ? {} : { enforcement: enforcementState }

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
			request.returningSelection,
		)
		const {
			assertReadableTargets: _assertReadableTargets,
			returningSelection: _returningSelection,
			...databaseRequest
		} = request
		void _assertReadableTargets
		void _returningSelection
		const result = await executor.execute(
			immutableRecord({ ...databaseRequest, plan }),
		)

		return immutableRecord({
			...retainedEnforcement(),
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
	type TMutationRecord = DatabaseMutationLogicalRecord<TMutationOperation>
	// The operation-kind guard above narrows the generic request to its mutation branch.
	const initialOperation: TMutationOperation = request.operation
	let operation: TMutationOperation = initialOperation
	// Counts value-changing replacements; final validation never counts as one.
	let replacements = 0
	let target: TMutationRecord | null | undefined
	let targets: readonly TMutationRecord[] | undefined
	const replaceOperation = (next: TMutationOperation): void => {
		if (next !== operation) replacements += 1
		operation = next
	}
	const prepareMutationItems =
		behaviors?.requiresPreparedMutationItems?.(request.operation) === true ||
		enforcement?.requiresPreparedMutationItems?.(request.operation) === true ||
		((persistencePlanRewrite !== undefined ||
			request.assertReadableTargets !== undefined) &&
			request.operation.kind === 'delete-many')
	const prepareMutation = async (): Promise<
		Readonly<{
			prepared: PreparedDatabaseOperation<TMutationOperation>
			target: TMutationRecord | null | undefined
			targets?: readonly TMutationRecord[]
		}>
	> => {
		const plan = createDatabasePersistencePlanWithSelection(
			operation,
			request.returningSelection ?? readOperationResultSelection(operation),
		)
		assertPersistencePlanCapability(executor, plan)
		const prepared = await executor.prepare(
			immutableRecord({
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
		// The adapter contract ties these validated logical records to the operation schema.
		const records = readRuntimePreparedMutationRecords(prepared) as Readonly<{
			target: TMutationRecord | null | undefined
			targets?: readonly TMutationRecord[]
		}>
		const directed =
			operation.kind === 'update-one' || operation.kind === 'delete-one'

		if (
			(directed || operation.kind === 'upsert-one') &&
			records.target === undefined
		) {
			throw new TypeError(
				'Prepared directed mutation must expose its complete target',
			)
		}
		if (
			prepareMutationItems &&
			(operation.kind === 'update-many' || operation.kind === 'delete-many') &&
			records.targets === undefined
		) {
			throw new TypeError(
				'Prepared set-based mutation must expose its complete targets',
			)
		}
		if (directed && records.target === null && request.strictTarget === true) {
			throw createProtectedObjectNotFoundError()
		}
		return { ...records, prepared }
	}
	const enforcePreparedMutation = async (): Promise<void> => {
		if (
			enforcement?.enforcePreparedMutation !== undefined &&
			enforcementState !== undefined
		) {
			await enforcement.enforcePreparedMutation(
				createRuntimePreparedMutationInput(context, operation, target, targets),
			)
		}
	}

	// Creates have no stable target, so they prepare only after input resolution.
	const preparesAfterResolution =
		operation.kind === 'create-one' || operation.kind === 'create-many'
	let prepared: PreparedDatabaseOperation<TMutationOperation> | undefined

	if (!preparesAfterResolution) {
		;({ prepared, target, targets } = await prepareMutation())
		await enforcePreparedMutation()
		// A delete answers with its pre-image, checked while still locked.
		await request.assertReadableTargets?.(
			(targets ?? (target === null || target === undefined ? [] : [target]))
				.map((record) => executor.readObjectIdentity?.(record) ?? record.id)
				.filter((id): id is string => typeof id === 'string'),
		)
	}
	if (nestedLifecycle !== undefined) {
		// Nested graph coordination proves it returns the same mutation terminal.
		replaceOperation(
			(await nestedLifecycle.beforeMutationResolution(
				operation,
				target,
			)) as TMutationOperation,
		)
	}

	if (
		behaviors?.transformInput !== undefined &&
		operation.kind !== 'delete-one' &&
		operation.kind !== 'delete-many'
	) {
		replaceOperation(
			await behaviors.transformInput(
				createRuntimeOperationInput(context, operation),
			),
		)
	}
	if (
		behaviors?.transformPreparedInput !== undefined &&
		(operation.kind === 'create-one' ||
			operation.kind === 'update-one' ||
			operation.kind === 'upsert-one') &&
		!(operation.kind === 'update-one' && target === null)
	) {
		replaceOperation(
			await behaviors.transformPreparedInput(
				createRuntimePreparedMutationInput(
					context,
					operation,
					operation.kind === 'create-one' ? null : target,
					targets,
				),
			),
		)
	}
	if (
		target !== undefined &&
		target !== null &&
		behaviors?.transformPreparedOperation !== undefined
	) {
		replaceOperation(
			await behaviors.transformPreparedOperation(
				createRuntimePreparedMutationInput(
					context,
					operation,
					target,
					undefined,
				),
			),
		)
	}

	const revalidate = (
		candidate: TMutationOperation,
	): Promise<TMutationOperation> =>
		Promise.resolve(
			finalMutationValidation(
				createRuntimeStageInput({
					context,
					operation: candidate,
					previousOperation: initialOperation,
					target,
					...(targets === undefined ? {} : { targets }),
				}),
			),
		)
	const validateMutationInput = behaviors?.validateMutationInput
	if (validateMutationInput === undefined) {
		operation = await revalidate(operation)
	} else {
		// Core's structural issues and the validation behaviors' issues form
		// one VALIDATION_ERROR (ADR-0319).
		let structuralIssues: readonly RuntimeMutationValidationIssue[] = []
		try {
			operation = await revalidate(operation)
		} catch (error: unknown) {
			const issues = readValidationErrorIssues(error)
			if (issues === undefined) throw error
			structuralIssues = issues
		}
		const cancellation = {
			operationKind: operation.kind,
			phase: 'final-mutation-validation',
		}
		throwIfOperationCancelled(context.signal, cancellation)
		const validation = await validateMutationInput(
			immutableRecord({
				...createRuntimePreparedMutationInput(
					context,
					operation,
					target,
					targets,
				),
				structuralIssues,
			}),
		)
		throwIfOperationCancelled(context.signal, cancellation)
		throwMergedValidationIssues([...structuralIssues, ...validation.issues])
		if (validation.operation !== operation) {
			// Validator outputs are stored: they must stay structurally valid.
			replaceOperation(await revalidate(validation.operation))
		}
	}

	if (behaviors?.guardMutationInput !== undefined) {
		const cancellation = {
			operationKind: operation.kind,
			phase: 'final-mutation-input-guard',
		}
		throwIfOperationCancelled(context.signal, cancellation)
		await behaviors.guardMutationInput(
			createRuntimePreparedMutationInput(context, operation, target, targets),
		)
		throwIfOperationCancelled(context.signal, cancellation)
	}

	if (
		replacements > 0 &&
		enforcement !== undefined &&
		enforcementState !== undefined
	) {
		enforcementState = await enforcement.reevaluate(
			createRuntimeEnforcementInput(context, operation, enforcementState),
		)
		const enforced = await enforcement.enforceOperation(
			createRuntimeEnforcementInput(context, operation, enforcementState),
		)
		operation = enforced.operation
	}
	if (replacements > 0) await enforcePreparedMutation()
	nestedLifecycle?.afterMutationResolution(operation)

	if (behaviors?.beforeOperation !== undefined) {
		await behaviors.beforeOperation(
			createRuntimeOperationInput(context, operation),
		)
	}
	if (
		behaviors?.observePreparedMutation !== undefined &&
		!(
			(operation.kind === 'update-one' || operation.kind === 'delete-one') &&
			target === null
		)
	) {
		await behaviors.observePreparedMutation(
			createRuntimePreparedMutationInput(context, operation, target, targets),
		)
	}

	prepared ??= (await prepareMutation()).prepared
	const plan = await compileDatabasePersistencePlan(
		executor,
		operation,
		persistencePlanRewrite,
		request.returningSelection,
	)
	let outcome = await prepared.execute(immutableRecord({ operation, plan }))

	if (
		enforcement?.enforceMutationOutcome !== undefined &&
		enforcementState !== undefined
	) {
		outcome = await enforcement.enforceMutationOutcome(
			createRuntimeStageInput({ context, operation, outcome }),
		)
	}
	if (behaviors?.transformMutationOutcome !== undefined) {
		const selectedFieldsOverride = request.returningSelection?.fields.map(
			({ field }) => field,
		)
		outcome = await behaviors.transformMutationOutcome(
			createRuntimeStageInput({
				context,
				operation: request.operation,
				outcome,
				...(selectedFieldsOverride === undefined
					? {}
					: { selectedFieldsOverride }),
			}),
		)
	}
	await nestedLifecycle?.afterMutationOutcome(outcome)
	const inclusionSource = await loadSingularMutationInclusionSource(
		executor,
		operation,
		outcome,
		request.inclusions,
		request.returningSelection,
	)

	return immutableRecord({
		...retainedEnforcement(),
		...(inclusionSource === undefined ? {} : { inclusionSource }),
		objectIdentities: collectDatabaseObjectIdentities(
			executor,
			request.operation,
			outcome.result,
			outcome,
		),
		outcome,
		operation,
		// With eager loading, the transaction-bound get is the authoritative result.
		result:
			inclusionSource ??
			readRewrittenDeleteResult(operation, plan, outcome.result),
	})
}
