import { compileValidationPlans, Schema } from '../../schema/index.js'

import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeMutationRevalidationStage } from '../pipeline/contracts.js'
import { validateProjectedMutationArithmetic } from './projected-arithmetic-validation.js'
import { revalidateRuntimeMutationOperation } from './runtime-validation.js'

/** Creates the mandatory post-resolution validation stage for one application. */
export const createFinalMutationValidationStage =
	(): RuntimeMutationRevalidationStage => {
		const plansBySchema = new WeakMap<
			object,
			ReturnType<typeof compileValidationPlans>
		>()

		return (input) => {
			const schema = getOperationSchema(input.operation)

			if (!Schema.is(schema)) {
				// Initial structural validation normally reports this before the final pass.
				throw new TypeError(
					'Final mutation validation requires a schema definition',
				)
			}

			let plans = plansBySchema.get(schema)
			if (plans === undefined) {
				plans = compileValidationPlans(schema)
				plansBySchema.set(schema, plans)
			}

			const operation = revalidateRuntimeMutationOperation(
				input.previousOperation,
				input.operation,
				plans,
			)

			validateProjectedMutationArithmetic(
				operation,
				plans,
				input.target,
				input.targets,
			)

			return operation
		}
	}
