import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import { isRelationUpdateExpression } from '../../schema/relations/mutation.js'
import { Pointer, Schema } from '../../schema/index.js'
import { RequestContext } from '../context/request-context.js'
import { assertDatabaseConstraintVersion } from '../../plugins/constraint-compilers.js'
import {
	databaseInclusionCapabilityVersion,
	databaseRelationCapabilityVersion,
	databaseRelationPredicateCapabilityVersion,
} from '../database/contracts.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
	DatabaseInclusionPlan,
	DatabaseOperationResult,
	DatabaseRelationScope,
	DatabaseRelationPredicateScope,
	DatabaseRowFilterNode,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import type { HookErrorPhase } from '../../schema/hooks/contracts.js'
import {
	beginPipelineTransaction,
	type RuntimePipelineTransactionScope,
} from '../transactions/pipeline-transaction.js'
import { createRuntimeHookBoundaries } from '../hooks/boundaries.js'
import type {
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementStageInput,
	RuntimeEnforcementStages,
	RuntimeOperationStageInput,
	RuntimeNativeHookStages,
	RuntimeNativeDatabaseResultStageInput,
	RuntimePreparedMutationTransformStage,
	RuntimeNativeTransactionOperation,
	RuntimeNativeResultStageInput,
	RuntimeOperationResult,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultStageInput,
} from './contracts.js'
import {
	getEnforcementStateSnapshot,
	type EnforcementState,
} from '../enforcement/state.js'
import { throwIfOperationCancelled } from '../hooks/cancellation.js'
import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import { collectQueryRelationPredicates } from '../../query/filters/relation.js'
import type { ExecutableOperationAst } from '../../query/index.js'
import { readOperationQueries } from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	collectDatabaseObjectIdentities,
	retainRuntimeIncludedPointerValue,
	retainRuntimeSchemaModelMetadata,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import {
	createInclusionOperation,
	readInclusions,
	type RuntimeInclusion,
	type RuntimeInclusionTargetOperation,
} from '../relations/inclusion.js'

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

const emptyConstraints: readonly DatabaseConstraintNode[] = immutableArray([])

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

interface RuntimeDatabaseExecution<TOperation extends DatabaseOperationAst> {
	readonly enforcement?: EnforcementState
	readonly objectIdentities: readonly unknown[]
	readonly operation: TOperation
	readonly outcome?: DatabaseOperationOutcome<DatabaseMutationOperationAst>
	readonly result: DatabaseOperationResult<TOperation>
}

/** Retains target policy beside one adapter-ready nested read. */
interface RuntimePreparedInclusion {
	readonly database: DatabaseInclusionPlan
	readonly descriptor: RuntimeInclusion
	readonly enforcement: EnforcementState | undefined
	readonly nested: readonly RuntimePreparedInclusion[]
	readonly operation: RuntimeInclusionTargetOperation
	readonly selectedFieldsOverride: readonly string[] | undefined
	readonly unavailable: boolean
}

/** Carries only mutable orchestration state that never crosses a hook boundary. */
interface RuntimePipelineExecutionState {
	operation: DatabaseOperationAst
	readonly phase: HookErrorPhase
	transactionOperation?: RuntimeNativeTransactionOperation
}

/** Preserves an operation failure when its error observer independently fails. */
const combineExecutionErrors = (
	error: unknown,
	observerError: unknown,
): AggregateError =>
	new AggregateError(
		[error, observerError],
		'Runtime operation and its error observer both failed.',
		{ cause: error },
	)

/** Identifies only the framework-owned denial that protected scopes may hide. */
const isNativeAccessDenied = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	error.code === 'PERMISSION_DENIED' &&
	error.internalDetails?.kind === 'native-access-denied'

/** Narrows the closed terminal union before selecting the adapter protocol. */
const isMutationOperation = (
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

/** Rejects relation work unless the active transaction adapter claims its protocol. */
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

/** Keeps prepared internal materializations behind the Runtime result boundary. */
const executeDatabaseOperation = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	context: RequestContext,
	nativeHooks: RuntimeNativeHookStages | undefined,
	preparedOperationHooks: RuntimePreparedMutationTransformStage | undefined,
	globalBeforeHooks: RuntimePipelineStages['globalBeforeHooks'],
	schemaBeforeHooks: RuntimePipelineStages['schemaBeforeHooks'],
	request: {
		readonly constraints: readonly DatabaseConstraintNode[]
		readonly operation: TOperation
		readonly strictTarget?: true
		readonly inclusions?: readonly DatabaseInclusionPlan[]
		readonly relation?: DatabaseRelationScope
		readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
		readonly rowFilter?: DatabaseRowFilterNode
	},
	enforcement: RuntimeEnforcementStages | undefined,
	enforcementState: EnforcementState | undefined,
): Promise<RuntimeDatabaseExecution<TOperation>> => {
	assertRelationMutationCapability(executor, request.operation)

	if (request.inclusions !== undefined) {
		const capability: unknown = executor.capabilities?.inclusions

		if (
			!isPlainRecord(capability) ||
			capability.kind !== 'inclusions' ||
			capability.version !== databaseInclusionCapabilityVersion ||
			typeof executor.readIncludedValue !== 'function'
		) {
			throw new FrameworkError(
				'INTERNAL_ERROR',
				`Database adapter must implement inclusion capability version ${String(databaseInclusionCapabilityVersion)}.`,
				{ publicMessage: 'Relationship inclusion is not available.' },
			)
		}
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

	const executable = request.operation as unknown as ExecutableOperationAst
	const predicates = readOperationQueries(executable).flatMap((query) =>
		query.where === undefined
			? []
			: [...collectQueryRelationPredicates(query.where.expression)],
	)

	if (predicates.length > 0) {
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

	if (!isMutationOperation(request.operation)) {
		await globalBeforeHooks(createOperationInput(context, request.operation))
		await schemaBeforeHooks(createOperationInput(context, request.operation))
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
		nativeHooks?.requiresPreparedMutationItems(request.operation) === true
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
				immutableRecord({ context, operation: executableOperation }),
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
				immutableRecord({
					context,
					operation: operationBeforeResolution,
					target: executableOperation.kind === 'create-one' ? null : target,
					...(targets === undefined ? {} : { targets }),
				}),
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
				immutableRecord({
					context,
					operation: operationBeforeResolution,
					target,
				}),
			)
			operationTransformed ||= executableOperation !== operationBeforeResolution
		}

		if (operationTransformed && nativeHooks !== undefined) {
			executableOperation = await nativeHooks.revalidate(
				immutableRecord({ context, operation: executableOperation }),
			)
		}

		if (
			operationTransformed &&
			enforcement !== undefined &&
			enforcementState !== undefined
		) {
			enforcementState = await enforcement.reevaluate(
				immutableRecord({
					context,
					enforcement: enforcementState,
					operation: executableOperation,
				}),
			)
			const enforced = await enforcement.enforceOperation(
				immutableRecord({
					context,
					enforcement: enforcementState,
					operation: executableOperation,
				}),
			)
			executableOperation = enforced.operation
			finalConstraints = snapshotConstraints(enforced.constraints)
		}

		if (
			operationTransformed &&
			enforcement?.enforcePreparedMutation !== undefined &&
			enforcementState !== undefined
		) {
			await enforcement.enforcePreparedMutation(
				immutableRecord({ context, operation: executableOperation, target }),
			)
		}
	}
	const runMutationObservers = async (
		target:
			DatabaseMutationLogicalRecord<TMutationOperation> | null | undefined,
		targets:
			readonly DatabaseMutationLogicalRecord<TMutationOperation>[] | undefined,
	): Promise<void> => {
		await globalBeforeHooks(createOperationInput(context, executableOperation))
		await schemaBeforeHooks(createOperationInput(context, executableOperation))

		if (
			nativeHooks !== undefined &&
			!(
				(executableOperation.kind === 'update-one' ||
					executableOperation.kind === 'delete-one') &&
				target === null
			)
		) {
			await nativeHooks.schemaPrepared(
				immutableRecord({
					context,
					operation: executableOperation,
					target,
					...(targets === undefined ? {} : { targets }),
				}),
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
				immutableRecord({ context, operation: executableOperation, target }),
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
			immutableRecord({ context, operation: executableOperation, outcome }),
		)
	}

	if (nativeHooks !== undefined) {
		outcome = await nativeHooks.mutationOutcome(
			immutableRecord({ context, operation: request.operation, outcome }),
		)
	}

	return immutableRecord({
		...(enforcementState === undefined
			? {}
			: { enforcement: enforcementState }),
		objectIdentities: collectDatabaseObjectIdentities(
			executor,
			request.operation,
			outcome.result,
			outcome,
		),
		outcome,
		operation: executableOperation,
		result: outcome.result,
	})
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

/** Copies constraint collections so plugins cannot mutate later adapter input. */
const snapshotConstraints = (
	constraints: readonly DatabaseConstraintNode[],
): readonly DatabaseConstraintNode[] => {
	const untrustedConstraints: unknown = constraints

	if (!isUnknownArray(untrustedConstraints)) {
		throw new TypeError('Runtime enforcement constraints must be an array')
	}

	for (const constraint of untrustedConstraints) {
		if (!isPlainRecord(constraint)) {
			throw new TypeError('Runtime enforcement returned an invalid constraint')
		}

		assertNonEmptyString(constraint.kind, 'Runtime enforcement constraint kind')
		assertDatabaseConstraintVersion(
			constraint.version,
			'Runtime enforcement constraint version',
		)

		if (!Object.hasOwn(constraint, 'payload')) {
			throw new TypeError(
				'Runtime enforcement constraint must contain an opaque payload',
			)
		}
	}

	return immutableArray(constraints)
}

const createOperationInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
): RuntimeOperationStageInput<TOperation> =>
	immutableRecord({ context, operation })

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

const createEnforcementInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	enforcement: EnforcementState,
): RuntimeEnforcementStageInput<TOperation> =>
	immutableRecord({ context, enforcement, operation })

const createEnforcementResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	enforcement: EnforcementState,
): RuntimeResultStageInput<TOperation> & {
	readonly enforcement: EnforcementState
} => immutableRecord({ context, enforcement, operation, result })

const createResultInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
): RuntimeResultStageInput<TOperation> =>
	immutableRecord({ context, operation, result })

/** Reads the effective projection after enforcement materializes implicit select-all. */
const readSelectedFieldsOverride = (
	operation: DatabaseOperationAst,
	enforcement: EnforcementState | undefined,
): readonly string[] | undefined => {
	if (enforcement === undefined) {
		return undefined
	}

	const permittedFields =
		getEnforcementStateSnapshot(enforcement).selectionFields

	if (permittedFields === undefined) {
		return undefined
	}

	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		return permittedFields
	}
	const selection: unknown =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? candidate.selection
			: isPlainRecord(candidate.query)
				? candidate.query.selection
				: undefined

	if (!isPlainRecord(selection) || !isUnknownArray(selection.fields)) {
		return permittedFields
	}

	const selectedFields: string[] = []

	for (const selected of selection.fields) {
		if (isPlainRecord(selected) && typeof selected.field === 'string') {
			selectedFields.push(selected.field)
		}
	}

	return immutableArray(selectedFields)
}

/** Retains the effective public projection for later immutable model commands. */
const readSchemaModelSelectedFields = (
	operation: DatabaseOperationAst,
	selectedFieldsOverride: readonly string[] | undefined,
): readonly string[] | undefined => {
	if (selectedFieldsOverride !== undefined) {
		return selectedFieldsOverride
	}

	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		return undefined
	}
	const selection: unknown =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? candidate.selection
			: isPlainRecord(candidate.query)
				? candidate.query.selection
				: undefined

	if (
		!isPlainRecord(selection) ||
		!isUnknownArray(selection.fields) ||
		selection.fields.length === 0
	) {
		return undefined
	}

	const selectedFields: string[] = []

	for (const selected of selection.fields) {
		if (isPlainRecord(selected) && typeof selected.field === 'string') {
			selectedFields.push(selected.field)
		}
	}

	return immutableArray(selectedFields)
}

const createNativeResultInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	selectedFieldsOverride: readonly string[] | undefined,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst> | undefined,
): RuntimeNativeResultStageInput<TOperation> =>
	immutableRecord({
		context,
		operation,
		...(outcome === undefined ? {} : { outcome }),
		result,
		...(selectedFieldsOverride === undefined ? {} : { selectedFieldsOverride }),
	})

const createNativeDatabaseResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	selectedFieldsOverride: readonly string[] | undefined,
): RuntimeNativeDatabaseResultStageInput<TOperation> =>
	immutableRecord({
		context,
		operation,
		result,
		...(selectedFieldsOverride === undefined ? {} : { selectedFieldsOverride }),
	})

/**
 * Executes every operation through one fixed security and transaction order.
 * Framework errors intentionally cross this boundary unchanged for transports.
 */
export class RuntimePipeline {
	readonly #stages: Readonly<RuntimePipelineStages>
	readonly #resultBoundaries = createRuntimeHookBoundaries()

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

	/** Prepares target security without manufacturing target schema read hooks. */
	async #prepareInclusions(
		context: RequestContext,
		parentOperation: DatabaseOperationAst,
	): Promise<readonly RuntimePreparedInclusion[]> {
		const prepared: RuntimePreparedInclusion[] = []
		const parentSchema = getOperationSchema(parentOperation)

		if (!Schema.is(parentSchema)) {
			throw new TypeError('Runtime inclusion source schema is invalid')
		}

		for (const descriptor of readInclusions(parentOperation)) {
			let operation = createInclusionOperation(descriptor)

			operation = await this.#stages.normalization(
				createOperationInput(context, operation),
			)
			operation = await this.#stages.structuralValidation(
				createOperationInput(context, operation),
			)

			let enforcement: EnforcementState | undefined
			let constraints: readonly DatabaseConstraintNode[] = emptyConstraints
			let relationPredicates:
				readonly DatabaseRelationPredicateScope[] | undefined
			let rowFilter: DatabaseRowFilterNode | undefined

			if (
				descriptor.kind === 'relation' &&
				this.#stages.enforcement?.enforceRelationRead !== undefined
			) {
				await this.#stages.enforcement.enforceRelationRead(
					immutableRecord({
						context,
						operation,
						relation: immutableRecord({
							fieldPath: immutableArray([descriptor.field]),
							source: parentSchema,
							target: descriptor.query.schema.definition,
						}),
					}),
				)
			}

			try {
				if (this.#stages.enforcement !== undefined) {
					enforcement = await this.#stages.enforcement.evaluate(
						createOperationInput(context, operation),
					)
					const enforced = await this.#stages.enforcement.enforceOperation(
						createEnforcementInput(context, operation, enforcement),
					)

					operation = enforced.operation
					constraints = snapshotConstraints(enforced.constraints)
					relationPredicates = enforced.relationPredicates
					rowFilter = enforced.rowFilter
				}
			} catch (error: unknown) {
				if (!isNativeAccessDenied(error)) throw error

				const request = immutableRecord({
					constraints: emptyConstraints,
					operation,
				})
				const database = immutableRecord({
					fieldPath: immutableArray([descriptor.field]),
					kind: descriptor.kind,
					request,
					unavailable: true as const,
				})

				prepared.push(
					immutableRecord({
						database,
						descriptor,
						enforcement: undefined,
						nested: immutableArray([]),
						operation,
						selectedFieldsOverride: undefined,
						unavailable: true,
					}),
				)
				continue
			}

			const nested = await this.#prepareInclusions(context, operation)
			const request = immutableRecord({
				constraints,
				operation,
				...(nested.length === 0
					? {}
					: {
							inclusions: immutableArray(
								nested.map(({ database }) => database),
							),
						}),
				...(relationPredicates === undefined ? {} : { relationPredicates }),
				...(rowFilter === undefined ? {} : { rowFilter }),
			})
			const database = immutableRecord({
				fieldPath: immutableArray([descriptor.field]),
				kind: descriptor.kind,
				request,
			})

			prepared.push(
				immutableRecord({
					database,
					descriptor,
					enforcement,
					nested,
					operation,
					selectedFieldsOverride: readSelectedFieldsOverride(
						operation,
						enforcement,
					),
					unavailable: false,
				}),
			)
		}

		return immutableArray(prepared)
	}

	/** Completes Access and scalar output resolution for one eager target branch. */
	async #finalizeIncludedValue(
		context: RequestContext,
		prepared: RuntimePreparedInclusion,
		rawTarget:
			| Readonly<Record<string, unknown>>
			| readonly Readonly<Record<string, unknown>>[],
	): Promise<unknown> {
		let result =
			rawTarget as DatabaseOperationResult<RuntimeInclusionTargetOperation>

		if (
			this.#stages.enforcement !== undefined &&
			prepared.enforcement !== undefined
		) {
			result = await this.#stages.enforcement.enforceSelectionResult(
				immutableRecord({
					context,
					enforcement: prepared.enforcement,
					operation: prepared.operation,
					result,
				}),
			)
		}

		result = this.#resultBoundaries.snapshotDatabaseResultReplacement(
			prepared.operation,
			result,
			prepared.selectedFieldsOverride,
		)

		if (this.#stages.nativeHooks !== undefined) {
			result = await this.#stages.nativeHooks.resolveOutput(
				createNativeDatabaseResultInput(
					context,
					prepared.operation,
					result,
					prepared.selectedFieldsOverride,
				),
			)
		}

		const hydrated = await this.#hydrateInclusions(
			context,
			prepared.operation,
			result,
			rawTarget,
			prepared.nested,
		)
		const rawRecords = isUnknownArray(rawTarget) ? rawTarget : [rawTarget]
		const identities = immutableArray(
			rawRecords.map((record) =>
				isPlainRecord(record)
					? this.#stages.databaseOperation.readObjectIdentity?.(record)
					: undefined,
			),
		)

		retainRuntimeSchemaModelMetadata(
			prepared.operation,
			identities,
			hydrated,
			readSchemaModelSelectedFields(
				prepared.operation,
				prepared.selectedFieldsOverride,
			),
		)
		let finalized = hydrated

		if (
			this.#stages.enforcement !== undefined &&
			prepared.enforcement !== undefined
		) {
			finalized = await this.#stages.enforcement.enforceResult(
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

	/** Replaces relationship fields with their adapter-retained target values. */
	async #hydrateIncludedRecord(
		context: RequestContext,
		record: Readonly<Record<string, unknown>>,
		rawRecord: Readonly<Record<string, unknown>>,
		inclusions: readonly RuntimePreparedInclusion[],
	): Promise<Readonly<Record<string, unknown>>> {
		let hydrated = record

		for (const inclusion of inclusions) {
			const field = inclusion.descriptor.field

			const pointer: unknown = hydrated[field]

			if (inclusion.descriptor.kind === 'pointer') {
				if (!Object.hasOwn(hydrated, field) || pointer === null) continue
				if (!Pointer.is(pointer)) {
					throw new TypeError(
						`Runtime pointer inclusion ${field} must receive a Pointer`,
					)
				}
			}

			let target: unknown =
				inclusion.descriptor.kind === 'pointer' ? null : immutableArray([])

			if (!inclusion.unavailable) {
				const retained = this.#stages.databaseOperation.readIncludedValue?.(
					rawRecord,
					inclusion.database.fieldPath,
				)

				if (retained === undefined) {
					throw new TypeError(
						`Database adapter did not retain relationship inclusion ${field}`,
					)
				}
				target = retained
			}

			if (
				inclusion.descriptor.kind === 'pointer' &&
				target !== null &&
				!isPlainRecord(target)
			) {
				throw new TypeError(
					`Runtime included pointer ${field} must be a record`,
				)
			}
			if (inclusion.descriptor.kind === 'relation' && !isUnknownArray(target)) {
				throw new TypeError(
					`Runtime included relation ${field} must be an array`,
				)
			}

			const replacement =
				target === null
					? null
					: await this.#finalizeIncludedValue(
							context,
							inclusion,
							target as
								| Readonly<Record<string, unknown>>
								| readonly Readonly<Record<string, unknown>>[],
						)
			const next = immutableRecord({ ...hydrated, [field]: replacement })

			transferRuntimeSchemaModelMetadata(hydrated, next)
			if (inclusion.descriptor.kind === 'pointer') {
				retainRuntimeIncludedPointerValue(next, [field], pointer)
			}
			hydrated = next
		}

		return hydrated
	}

	/** Preserves root cardinality while hydrating its exact adapter records by index. */
	async #hydrateInclusions<const TOperation extends DatabaseOperationAst>(
		context: RequestContext,
		operation: TOperation,
		result: DatabaseOperationResult<TOperation>,
		rawResult: DatabaseOperationResult<TOperation>,
		inclusions: readonly RuntimePreparedInclusion[],
	): Promise<RuntimeOperationResult<TOperation>> {
		if (inclusions.length === 0 || result === null) {
			return result as unknown as RuntimeOperationResult<TOperation>
		}

		if (operation.kind === 'find-many') {
			if (!isUnknownArray(result) || !isUnknownArray(rawResult)) {
				throw new TypeError('Runtime included collection must be an array')
			}
			if (result.length !== rawResult.length) {
				throw new TypeError(
					'Runtime included cardinality changed before hydration',
				)
			}

			return immutableArray(
				await Promise.all(
					result.map((record, index) => {
						const rawRecord: unknown = rawResult[index]

						if (!isPlainRecord(record) || !isPlainRecord(rawRecord)) {
							throw new TypeError('Runtime included source must be a record')
						}

						return this.#hydrateIncludedRecord(
							context,
							record,
							rawRecord,
							inclusions,
						)
					}),
				),
			) as unknown as RuntimeOperationResult<TOperation>
		}

		if (!isPlainRecord(result) || !isPlainRecord(rawResult)) {
			throw new TypeError('Runtime included source must be a record')
		}

		return (await this.#hydrateIncludedRecord(
			context,
			result,
			rawResult,
			inclusions,
		)) as unknown as RuntimeOperationResult<TOperation>
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
			phase: 'operation',
		}
		const transactionLifecycle = this.#stages.nativeHooks?.transactionLifecycle

		if (transactionLifecycle !== undefined) {
			execution.transactionOperation = transactionLifecycle.start({
				context,
				operation: request.operation,
			})
		}

		try {
			return await this.#executeOperation(request, execution)
		} catch (error: unknown) {
			if (
				request.nativeAccessDeniedAsMissing === true &&
				isNativeAccessDenied(error)
			) {
				if (
					request.operation.kind !== 'find-one' &&
					request.operation.kind !== 'exists'
				) {
					const hiddenError = createProtectedObjectNotFoundError()

					execution.transactionOperation?.fail(
						execution.operation,
						hiddenError,
						execution.phase,
					)

					throw hiddenError
				}

				const missingResult = request.operation.kind === 'exists' ? false : null

				// Expected target invisibility completes as an empty protected read.
				execution.transactionOperation?.succeed(
					execution.operation,
					missingResult,
				)

				return missingResult as RuntimeOperationResult<TOperation>
			}

			execution.transactionOperation?.fail(
				execution.operation,
				error,
				execution.phase,
			)

			if (
				transactionLifecycle === undefined &&
				this.#stages.nativeHooks?.onError !== undefined
			) {
				try {
					await this.#stages.nativeHooks.onError(
						immutableRecord({
							context,
							error,
							operation: execution.operation,
							phase: execution.phase,
							transaction: immutableRecord({
								rollback: 'not-applicable' as const,
								status: 'not-started' as const,
							}),
						}),
					)
				} catch (observerError: unknown) {
					throw combineExecutionErrors(error, observerError)
				}
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
			createOperationInput(context, operation),
		)
		operation = retainExecutionOperation(
			execution,
			await this.#stages.structuralValidation(
				createOperationInput(context, operation),
			),
		)

		let enforcement: EnforcementState | undefined
		let constraints: readonly DatabaseConstraintNode[] = emptyConstraints
		let rowFilter: DatabaseRowFilterNode | undefined = privateRowFilter
		let relationPredicates:
			readonly DatabaseRelationPredicateScope[] | undefined

		if (this.#stages.enforcement !== undefined) {
			if (
				privateRelation !== undefined &&
				!isMutationOperation(operation) &&
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
				createOperationInput(context, operation),
			)
			const enforced: RuntimeEnforcementOperationResult<TOperation> =
				await this.#stages.enforcement.enforceOperation(
					createEnforcementInput(context, operation, enforcement),
				)

			operation = retainExecutionOperation(execution, enforced.operation)
			constraints = snapshotConstraints(enforced.constraints)
			rowFilter = combineDatabaseRowFilters(
				privateRowFilter,
				enforced.rowFilter,
			)
			relationPredicates = enforced.relationPredicates
		}

		const inclusions = await this.#prepareInclusions(context, operation)

		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'database-operation',
		})

		const databaseExecution = await executeDatabaseOperation(
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
		const selectedFieldsOverride = readSelectedFieldsOverride(
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
				createNativeDatabaseResultInput(
					context,
					operation,
					databaseResult,
					selectedFieldsOverride,
				),
			)
		}

		let result: RuntimeOperationResult<TOperation> =
			await this.#hydrateInclusions(
				context,
				operation,
				databaseResult,
				databaseExecution.result,
				inclusions,
			)
		// Identity follows exact records through result hooks instead of being
		// reassociated by an unstable final collection index.
		retainRuntimeSchemaModelMetadata(
			operation,
			databaseExecution.objectIdentities,
			result,
			readSchemaModelSelectedFields(operation, selectedFieldsOverride),
		)

		if (this.#stages.nativeHooks !== undefined) {
			result = await this.#stages.nativeHooks.schemaAfter(
				createNativeResultInput(
					context,
					operation,
					result,
					selectedFieldsOverride,
					databaseExecution.outcome,
				),
			)
		}

		result = await this.#stages.schemaAfterHooks(
			createResultInput(context, operation, result),
		)
		result = await this.#stages.globalAfterHooks(
			createResultInput(context, operation, result),
		)
		// Legacy low-level result hooks share the same strict boundary as native hooks.
		result = this.#resultBoundaries.snapshotResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		)

		if (this.#stages.enforcement !== undefined && enforcement !== undefined) {
			result = await this.#stages.enforcement.enforceResult<TOperation>(
				createEnforcementResultInput(context, operation, result, enforcement),
			)
		}
		const completedOperation: RuntimeResultStageInput<TOperation> =
			createResultInput(context, operation, result)

		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'commit',
		})
		await this.#stages.commit(completedOperation)
		await this.#stages.postCommitEvents(completedOperation)
		execution.operation = operation
		execution.transactionOperation?.succeed(
			operation,
			result,
			databaseExecution.outcome,
		)

		return result
	}
}
