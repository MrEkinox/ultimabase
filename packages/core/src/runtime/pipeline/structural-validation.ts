import { immutableRecord } from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import {
	readValidationErrorIssues,
	throwMergedValidationIssues,
} from '../validation/validation-issues.js'
import type { RuntimePipelineStages } from './contracts.js'
import { createRuntimeOperationInput } from './stage-inputs.js'

/**
 * Runs Core's initial structural validation; when it rejects a mutation,
 * validation behaviors still report their own issues on the values present,
 * so one `VALIDATION_ERROR` lists them all (ADR-0319).
 */
export const validateRuntimeStructure = async <
	const TOperation extends DatabaseOperationAst,
>(
	stages: Readonly<RuntimePipelineStages>,
	context: RequestContext,
	operation: TOperation,
): Promise<TOperation> => {
	try {
		return await stages.structuralValidation(
			createRuntimeOperationInput(context, operation),
		)
	} catch (error: unknown) {
		const validate = stages.behaviors?.validateMutationInput
		const structuralIssues = readValidationErrorIssues(error)
		if (
			validate === undefined ||
			structuralIssues === undefined ||
			!isRuntimeMutationOperation(operation)
		) {
			throw error
		}
		const validation = await validate(
			immutableRecord({ context, operation, structuralIssues, target: undefined }),
		)
		throwMergedValidationIssues([...structuralIssues, ...validation.issues])
		throw error
	}
}
