import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { RuntimeCallbackExecutor } from '../contributions/execution.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import type {
	RuntimeDatabaseResultStageInput,
	RuntimeOperationResult,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import {
	createEnforcementExecutionDescriptor,
	normalizeEnforcementRestrictedFields,
	readEnforcementOperationSchema,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import { matchesEnforcementContribution } from './definitions.js'
import {
	getEnforcementStateSnapshot,
	narrowEnforcementFields,
	type EnforcementState,
} from './state.js'

/** Applies one final projection to plain adapter result records only. */
const restrictResultRecord = (
	result: Readonly<Record<string, unknown>>,
	permittedFields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const entries = Object.entries(result).filter(([field]) =>
		permittedFields.includes(field),
	)
	const restricted = immutableRecord(Object.fromEntries(entries))

	transferRuntimeSchemaModelMetadata(result, restricted)

	return restricted
}

const restrictResult = <const TResult>(
	result: TResult,
	permittedFields: readonly string[] | undefined,
): TResult => {
	if (permittedFields === undefined || result === null) {
		return result
	}

	const unknownResult: unknown = result

	if (isUnknownArray(unknownResult)) {
		return immutableArray(
			unknownResult.map((record) =>
				isPlainRecord(record)
					? restrictResultRecord(record, permittedFields)
					: record,
			),
		) as TResult
	}

	return (
		isPlainRecord(unknownResult)
			? restrictResultRecord(unknownResult, permittedFields)
			: result
	) as TResult
}

/** Hides selection-restricted fields before any output behavior can observe them. */
export const enforceSelectionResultRestrictions = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeDatabaseResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): DatabaseOperationResult<TOperation> => {
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	return restrictResult(input.result, snapshot.selectionFields)
}

/** Evaluates final output restrictions after business result replacement. */
export const enforceOutputRestrictions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimeResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): Promise<RuntimeOperationResult<TOperation>> => {
	const schema = readEnforcementOperationSchema(input.operation)
	let state = input.enforcement

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		if (
			implementation.kind === 'protected-policy' ||
			implementation.kind !== 'restrictOutput' ||
			(input.context.access.mode === 'master' &&
				implementation.master === 'bypass') ||
			!matchesEnforcementContribution(implementation, input.operation, schema)
		) {
			continue
		}

		const output: unknown = await runtime.invoke(
			// Output restrictions retain the same callback identity and recursion boundary.
			createEnforcementExecutionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					immutableRecord({
						context: input.context,
						operation: input.operation,
						result: input.result,
					}) as never,
				),
		)
		state = narrowEnforcementFields(
			state,
			'output',
			normalizeEnforcementRestrictedFields(output, schema, contribution),
		)
	}

	const snapshot = getEnforcementStateSnapshot(state)
	const permittedFields =
		snapshot.outputFields === undefined
			? snapshot.selectionFields
			: snapshot.selectionFields === undefined
				? snapshot.outputFields
				: snapshot.outputFields.filter((field) =>
						snapshot.selectionFields?.includes(field),
					)

	return restrictResult(input.result, permittedFields)
}
