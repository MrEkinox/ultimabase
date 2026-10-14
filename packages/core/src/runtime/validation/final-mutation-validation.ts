import { Schema } from '../../schema/index.js'

import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeMutationRevalidationStage } from '../pipeline/contracts.js'
import {
	readRuntimeValidationPlans,
	revalidateRuntimeMutationOperation,
} from './runtime-validation.js'
import { throwProjectedUpdateIssues } from './projected-update-validation.js'

/** Creates the mandatory post-resolution validation stage for one application. */
export const createFinalMutationValidationStage =
	(): RuntimeMutationRevalidationStage => (input) => {
		const schema = getOperationSchema(input.operation)

		if (!Schema.is(schema)) {
			// Initial structural validation normally reports this before the final pass.
			throw new TypeError(
				'Final mutation validation requires a schema definition',
			)
		}

		const plans = readRuntimeValidationPlans(schema)
		const operation = revalidateRuntimeMutationOperation(
			input.previousOperation,
			input.operation,
			plans,
		)

		throwProjectedUpdateIssues(
			schema,
			plans,
			operation,
			input.target,
			input.targets,
		)

		return operation
	}
