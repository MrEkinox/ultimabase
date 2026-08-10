import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import { collectQueryRelationPredicates } from '../../query/filters/relation.js'
import type { ExecutableOperationAst } from '../../query/index.js'
import { isRelationUpdateExpression } from '../../schema/relations/mutation.js'
import {
	databaseRelationCapabilityVersion,
	databaseRelationPredicateCapabilityVersion,
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
import type { EnforcementState } from '../enforcement/state.js'
import type { RequestContext } from '../context/request-context.js'
import { collectDatabaseObjectIdentities } from '../operations/model-metadata.js'
import { readOperationQueries } from '../operations/queries.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import type {
	RuntimeEnforcementStages,
	RuntimeNativeHookStages,
	RuntimePipelineStages,
	RuntimePreparedMutationTransformStage,
} from './contracts.js'
import {
	assertDatabaseInclusionCapability,
	loadSingularMutationInclusionSource,
} from './inclusion-projection.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeMutationOutcomeInput,
	createRuntimeOperationInput,
	createRuntimePreparedMutationInput,
	snapshotRuntimeConstraints,
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

/** Narrows the closed terminal union before selecting the adapter protocol. */
export const isRuntimeMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return false
		case 'create-many':
		case 'create-one':
		case 'delete-many':
		case 'delete-one':
		case 'update-many':
		case 'update-one':
		case 'upsert-many':
		case 'upsert-one':
			return true
	}
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

/** Rejects relation work unless the active transaction adapter claims it. */
const assertRelationMutationCapability = (
	executor: DatabaseOperationExecutor,
	operation: DatabaseOperationAst,
): void => {
	if (
		operation.kind !== 'update-one' ||
		!('update' in operation) ||
		!isRelationUpdateExpression(operation.update)
	) {
		return
	}

	const capability: unknown = executor.capabilities?.relations

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'relations' ||
		capability.version !== databaseRelationCapabilityVersion
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement relation capability version ${String(databaseRelationCapabilityVersion)}.`,
			{ publicMessage: 'Relation mutations are not available.' },
		)
	}
}

const assertDatabaseRequestCapabilities = (
	executor: DatabaseOperationExecutor,
	request: {
		readonly inclusions?: readonly DatabaseInclusionPlan[]
		readonly operation: DatabaseOperationAst
		readonly relation?: DatabaseRelationScope
		readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
		readonly rowFilter?: DatabaseRowFilterNode
	},
): void => {
	assertRelationMutationCapability(executor, request.operation)

	if (request.inclusions !== undefined) {
		assertDatabaseInclusionCapability(executor)
	}

	if (request.relation !== undefined) {
		const capability: unknown = executor.capabilities?.relations

		if (
			!isPlainRecord(capability) ||
			capability.kind !== 'relations' ||
			capability.version !== databaseRelationCapabilityVersion
		) {
			throw new FrameworkError(
				'INTERNAL_ERROR',
				`Database adapter must implement relation capability version ${String(databaseRelationCapabilityVersion)}.`,
				{ publicMessage: 'Relation queries are not available.' },
			)
		}
	}

	// Structural validation has already narrowed the operation to this closed AST.
	const executable = request.operation as unknown as ExecutableOperationAst
	const predicates = [
		...readOperationQueries(executable).flatMap((query) =>
			query.where === undefined
				? []
				: [...collectQueryRelationPredicates(query.where.expression)],
		),
		...(request.rowFilter === undefined
			? []
			: [...collectQueryRelationPredicates(request.rowFilter)]),
	]

	if (predicates.length === 0) return

	const capability: unknown = executor.capabilities?.relationPredicates

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'relation-predicates' ||
		capability.version !== databaseRelationPredicateCapabilityVersion
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement relation predicate capability version ${String(databaseRelationPredicateCapabilityVersion)}.`,
			{ publicMessage: 'Relation filters are not available.' },
		)
	}

	if (
		predicates.some(
			(predicate) =>
				!request.relationPredicates?.some(
					(scope) => scope.predicate === predicate,
				),
		)
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'Relation predicate target policy was not evaluated.',
			{ publicMessage: 'Relation filters are not available.' },
		)
	}
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

/** Owns adapter reads and prepared writes behind one immutable result envelope. */
export const executeRuntimeDatabaseOperation = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	context: RequestContext,
	nativeHooks: RuntimeNativeHookStages | undefined,
	preparedOperationHooks: RuntimePreparedMutationTransformStage | undefined,
	globalBeforeHooks: RuntimePipelineStages['globalBeforeHooks'],
	schemaBeforeHooks: RuntimePipelineStages['schemaBeforeHooks'],
	request: RuntimeDatabaseExecutionRequest<TOperation>,
	enforcement: RuntimeEnforcementStages | undefined,
	enforcementState: EnforcementState | undefined,
): Promise<RuntimeDatabaseExecution<TOperation>> => {
	assertDatabaseRequestCapabilities(executor, request)

	if (!isRuntimeMutationOperation(request.operation)) {
		await globalBeforeHooks(
			createRuntimeOperationInput(context, request.operation),
		)
		await schemaBeforeHooks(
			createRuntimeOperationInput(context, request.operation),
		)
		const result = await executor.execute(request)

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
	let executableOperation: TMutationOperation = request.operation
	let operationTransformed = false
	let finalConstraints = request.constraints
	const prepareMutationItems =
		nativeHooks?.requiresPreparedMutationItems(request.operation) === true ||
		enforcement?.requiresPreparedMutationItems?.(request.operation) === true
	const prepareMutation = (
		operation: TMutationOperation,
		constraints: readonly DatabaseConstraintNode[],
	): Promise<PreparedDatabaseOperation<TMutationOperation>> =>
		executor.prepare(
			immutableRecord({
				constraints,
				operation,
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
	const resolveMutationInput = async (
		target:
			DatabaseMutationLogicalRecord<TMutationOperation> | null | undefined,
		targets:
			readonly DatabaseMutationLogicalRecord<TMutationOperation>[] | undefined,
	): Promise<void> => {
		if (
			nativeHooks !== undefined &&
			executableOperation.kind !== 'delete-one' &&
			executableOperation.kind !== 'delete-many'
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await nativeHooks.resolveInput(
				createRuntimeOperationInput(context, executableOperation),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		if (
			nativeHooks !== undefined &&
			(executableOperation.kind === 'create-one' ||
				executableOperation.kind === 'update-one' ||
				executableOperation.kind === 'upsert-one') &&
			!(executableOperation.kind === 'update-one' && target === null)
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await nativeHooks.schemaResolveInput(
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
			preparedOperationHooks !== undefined
		) {
			const operationBeforeResolution = executableOperation
			executableOperation = await preparedOperationHooks(
				createRuntimePreparedMutationInput(
					context,
					operationBeforeResolution,
					target,
					undefined,
				),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		if (operationTransformed && nativeHooks !== undefined) {
			executableOperation = await nativeHooks.revalidate(
				createRuntimeOperationInput(context, executableOperation),
			)
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
		await globalBeforeHooks(
			createRuntimeOperationInput(context, executableOperation),
		)
		await schemaBeforeHooks(
			createRuntimeOperationInput(context, executableOperation),
		)

		if (
			nativeHooks !== undefined &&
			!(
				(executableOperation.kind === 'update-one' ||
					executableOperation.kind === 'delete-one') &&
				target === null
			)
		) {
			await nativeHooks.schemaPrepared(
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

	if (preparesAfterResolution) {
		await resolveMutationInput(undefined, undefined)
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
		await runMutationObservers(target, targets)
	}
	let outcome = await prepared.execute(
		immutableRecord({
			constraints: finalConstraints,
			operation: executableOperation,
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

	if (nativeHooks !== undefined) {
		outcome = await nativeHooks.mutationOutcome(
			createRuntimeMutationOutcomeInput(context, request.operation, outcome),
		)
	}
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
