import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { RequestContext } from '../context/request-context.js'
import type {
	DatabaseAccessConstraintNode,
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type {
	RuntimeAccessStageInput,
	RuntimeFieldPermissionStageResult,
	RuntimeOperationStageInput,
	RuntimePipelineRequest,
	RuntimePipelineStages,
	RuntimeResultStageInput,
} from './contracts.js'

const functionStageNames = [
	'normalization',
	'structuralValidation',
	'clp',
	'acl',
	'fieldPermissions',
	'globalBeforeHooks',
	'schemaBeforeHooks',
	'schemaAfterHooks',
	'globalAfterHooks',
	'commit',
	'postCommitEvents',
] as const satisfies readonly (keyof RuntimePipelineStages)[]

const emptyAccessConstraints: readonly DatabaseAccessConstraintNode[] =
	immutableArray([])

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
const snapshotAccessConstraints = (
	constraints: readonly DatabaseAccessConstraintNode[],
	stageName: string,
): readonly DatabaseAccessConstraintNode[] => {
	const untrustedConstraints: unknown = constraints

	if (!isUnknownArray(untrustedConstraints)) {
		throw new TypeError(
			`Runtime pipeline stage ${stageName} must return access constraints as an array`,
		)
	}

	for (const constraint of untrustedConstraints) {
		if (!isPlainRecord(constraint)) {
			throw new TypeError(
				`Runtime pipeline stage ${stageName} returned an invalid access constraint`,
			)
		}

		assertNonEmptyString(
			constraint.kind,
			`Runtime pipeline stage ${stageName} access constraint kind`,
		)
	}

	return immutableArray(constraints)
}

const createOperationInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
): RuntimeOperationStageInput<TOperation> =>
	immutableRecord({ context, operation })

const createAccessInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	accessConstraints: readonly DatabaseAccessConstraintNode[],
): RuntimeAccessStageInput<TOperation> =>
	immutableRecord({ context, operation, accessConstraints })

const createResultInput = <const TOperation extends DatabaseOperationAst>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
): RuntimeResultStageInput<TOperation> =>
	immutableRecord({ context, operation, result })

/**
 * Executes every operation through one fixed security and transaction order.
 * Framework errors intentionally cross this boundary unchanged for transports.
 */
export class RuntimePipeline {
	readonly #stages: Readonly<RuntimePipelineStages>

	constructor(stages: RuntimePipelineStages) {
		assertRuntimePipelineStages(stages)
		this.#stages = immutableRecord(stages)

		// Pipeline configuration cannot change after application initialization.
		Object.freeze(this)
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
		await this.#stages.clp(createOperationInput(context, operation))

		let accessConstraints: readonly DatabaseAccessConstraintNode[] =
			snapshotAccessConstraints(
				await this.#stages.acl(
					createAccessInput(context, operation, emptyAccessConstraints),
				),
				'acl',
			)
		const fieldPermissionResult: RuntimeFieldPermissionStageResult<TOperation> =
			await this.#stages.fieldPermissions(
				createAccessInput(context, operation, accessConstraints),
			)

		operation = fieldPermissionResult.operation
		accessConstraints = snapshotAccessConstraints(
			fieldPermissionResult.accessConstraints,
			'fieldPermissions',
		)
		operation = await this.#stages.globalBeforeHooks(
			createOperationInput(context, operation),
		)
		operation = await this.#stages.schemaBeforeHooks(
			createOperationInput(context, operation),
		)

		let result: DatabaseOperationResult<TOperation> =
			await this.#stages.databaseOperation.execute(
				immutableRecord({
					accessConstraints,
					operation,
				}),
			)

		result = await this.#stages.schemaAfterHooks(
			createResultInput(context, operation, result),
		)
		result = await this.#stages.globalAfterHooks(
			createResultInput(context, operation, result),
		)

		const completedOperation: RuntimeResultStageInput<TOperation> =
			createResultInput(context, operation, result)

		await this.#stages.commit(completedOperation)
		await this.#stages.postCommitEvents(completedOperation)

		return result
	}
}
