import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { RequestContext } from '../context/request-context.js'
import { assertDatabaseConstraintVersion } from '../../plugins/constraint-compilers.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
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
	RuntimeNativeResultStageInput,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultStageInput,
} from './contracts.js'
import {
	getEnforcementStateSnapshot,
	type EnforcementState,
} from '../enforcement/state.js'

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
	'fieldAfter',
	'fieldBefore',
	'resolveInput',
	'resolveOutput',
	'revalidate',
	'schemaAfter',
	'schemaBefore',
	'validate',
] as const satisfies readonly (keyof RuntimeNativeHookStages)[]

const emptyConstraints: readonly DatabaseConstraintNode[] = immutableArray([])

/** Narrows the closed terminal union before selecting the adapter protocol. */
const isMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
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

/** Keeps prepared internal materializations behind the Runtime result boundary. */
const executeDatabaseOperation = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	context: RequestContext,
	nativeHooks: RuntimeNativeHookStages | undefined,
	request: {
		readonly constraints: readonly DatabaseConstraintNode[]
		readonly operation: TOperation
	},
): Promise<DatabaseOperationResult<TOperation>> => {
	if (!isMutationOperation(request.operation)) {
		return executor.execute(request)
	}

	assertPreparedMutationExecutor(executor)
	const prepared = await executor.prepare(
		immutableRecord({
			constraints: request.constraints,
			operation: request.operation,
		}),
	)
	const target = 'target' in prepared ? prepared.target : undefined

	await nativeHooks?.fieldBefore(
		immutableRecord({ context, operation: request.operation, target }),
	)
	let outcome = await prepared.execute()

	if (nativeHooks !== undefined) {
		outcome = await nativeHooks.fieldAfter(
			immutableRecord({ context, operation: request.operation, outcome }),
		)
	}

	return outcome.result
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

const createEnforcementInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	enforcement: EnforcementState,
): RuntimeEnforcementStageInput<TOperation> =>
	immutableRecord({ context, enforcement, operation })

const createResultInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
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

	if (
		!isPlainRecord(candidate) ||
		!isPlainRecord(candidate.query) ||
		!isPlainRecord(candidate.query.selection) ||
		!isUnknownArray(candidate.query.selection.fields)
	) {
		return permittedFields
	}

	const selectedFields: string[] = []

	for (const selected of candidate.query.selection.fields) {
		if (isPlainRecord(selected) && typeof selected.field === 'string') {
			selectedFields.push(selected.field)
		}
	}

	return immutableArray(selectedFields)
}

const createNativeResultInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	selectedFieldsOverride: readonly string[] | undefined,
): RuntimeNativeResultStageInput<TOperation> =>
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

	async execute<const TOperation extends DatabaseOperationAst>(
		request: RuntimePipelineRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const untrustedRequest: unknown = request

		if (!isPlainRecord(untrustedRequest)) {
			throw new TypeError('Runtime pipeline request must be a plain object')
		}

		if (!(untrustedRequest.context instanceof RequestContext)) {
			throw new TypeError('Runtime pipeline context must be a RequestContext')
		}

		const context: RequestContext = request.context
		let operation: TOperation = request.operation

		operation = await this.#stages.normalization(
			createOperationInput(context, operation),
		)
		operation = await this.#stages.structuralValidation(
			createOperationInput(context, operation),
		)

		if (this.#stages.nativeHooks !== undefined) {
			operation = await this.#stages.nativeHooks.resolveInput(
				createOperationInput(context, operation),
			)
			operation = await this.#stages.nativeHooks.revalidate(
				createOperationInput(context, operation),
			)
			await this.#stages.nativeHooks.validate(
				createOperationInput(context, operation),
			)
		}

		let enforcement: EnforcementState | undefined
		let constraints: readonly DatabaseConstraintNode[] = emptyConstraints

		if (this.#stages.enforcement !== undefined) {
			enforcement = await this.#stages.enforcement.evaluate(
				createOperationInput(context, operation),
			)
			const enforced: RuntimeEnforcementOperationResult<TOperation> =
				await this.#stages.enforcement.enforceOperation(
					createEnforcementInput(context, operation, enforcement),
				)

			operation = enforced.operation
			constraints = snapshotConstraints(enforced.constraints)
		}

		operation = await this.#stages.globalBeforeHooks(
			createOperationInput(context, operation),
		)
		operation = await this.#stages.schemaBeforeHooks(
			createOperationInput(context, operation),
		)

		if (this.#stages.nativeHooks !== undefined) {
			operation = await this.#stages.nativeHooks.schemaBefore(
				createOperationInput(context, operation),
			)
			operation = await this.#stages.nativeHooks.revalidate(
				createOperationInput(context, operation),
			)
		}

		if (this.#stages.enforcement !== undefined && enforcement !== undefined) {
			enforcement = await this.#stages.enforcement.reevaluate(
				createEnforcementInput(context, operation, enforcement),
			)
			const enforced: RuntimeEnforcementOperationResult<TOperation> =
				await this.#stages.enforcement.enforceOperation(
					createEnforcementInput(context, operation, enforcement),
				)

			operation = enforced.operation
			constraints = snapshotConstraints(enforced.constraints)
		}

		let result: DatabaseOperationResult<TOperation> =
			await executeDatabaseOperation(
				this.#stages.databaseOperation,
				context,
				this.#stages.nativeHooks,
				immutableRecord({
					constraints,
					operation,
				}),
			)
		const selectedFieldsOverride = readSelectedFieldsOverride(
			operation,
			enforcement,
		)
		if (this.#stages.enforcement !== undefined && enforcement !== undefined) {
			result = await this.#stages.enforcement.enforceSelectionResult(
				immutableRecord({
					context,
					enforcement,
					operation,
					result,
				}),
			)
		}
		// Policy projection precedes validation so over-fetching adapters cannot
		// expose or invalidate fields that business output hooks may not observe.
		result = this.#resultBoundaries.snapshotResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		)

		if (this.#stages.nativeHooks !== undefined) {
			result = await this.#stages.nativeHooks.resolveOutput(
				createNativeResultInput(
					context,
					operation,
					result,
					selectedFieldsOverride,
				),
			)
			result = await this.#stages.nativeHooks.schemaAfter(
				createNativeResultInput(
					context,
					operation,
					result,
					selectedFieldsOverride,
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
			result = await this.#stages.enforcement.enforceResult(
				immutableRecord({
					context,
					enforcement,
					operation,
					result,
				}),
			)
		}

		const completedOperation: RuntimeResultStageInput<TOperation> =
			createResultInput(context, operation, result)

		await this.#stages.commit(completedOperation)
		await this.#stages.postCommitEvents(completedOperation)

		return result
	}
}
