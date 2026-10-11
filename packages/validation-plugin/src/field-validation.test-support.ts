import {
	createFinalMutationValidationStage as createCoreFinalMutationValidationStage,
	FrameworkError,
	UltimaBase,
	type CreateOneOperationAst,
	type RuntimeMutationRevalidationStage,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	QueryBuilder,
	RequestContext,
	requestSources,
	type ApplicationCallbackExecutor,
} from '@ultimabase/core/plugin'

import {
	createValidationPlanCache,
	validateMutationInput,
} from './operation-validation.js'
import { validationPlugin } from './plugin.js'

export const ValidationApplication = UltimaBase.use(validationPlugin())

const callbacks: ApplicationCallbackExecutor = {
	runApplication: (callback) => callback(),
	runPlugin: (_owner, callback) => callback(),
}

/**
 * Mirrors Core's final pass: structural validation, then the plugin, whose
 * issues become one VALIDATION_ERROR and whose outputs are revalidated.
 */
export const createFinalMutationValidationStage =
	(): RuntimeMutationRevalidationStage => {
		const validateStructure = createCoreFinalMutationValidationStage()
		const readPlans = createValidationPlanCache()
		return async (input) => {
			const operation = await validateStructure(input)
			const result = await validateMutationInput(
				{ ...input, operation, structuralIssues: [] },
				readPlans(operation),
				callbacks,
			)
			if (result.issues.length > 0) {
				throw new FrameworkError('VALIDATION_ERROR', 'Invalid input.', {
					publicDetails: { issues: result.issues },
				})
			}
			return result.operation === operation
				? operation
				: validateStructure({ ...input, operation: result.operation })
		}
	}

export const completeRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
	id: '0198d1ae-a800-7000-8000-000000000001',
	createdAt: '2026-08-21T12:00:00.000Z',
	updatedAt: '2026-08-21T12:00:00.000Z',
	...value,
})

const validationContext = RequestContext.anonymous({
	requestId: 'field-standard-schema-test',
	source: requestSources.internal,
})

/** Exercises application validation only through the mandatory final mutation stage. */
export const validateFinalCreate = async <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	input: Readonly<Record<string, unknown>>,
	dependencies: readonly SchemaDefinition[] = [],
): Promise<CreateOneOperationAst<TSchema>> => {
	new ValidationApplication({
		logger: false,
		schemas: [...dependencies, schema],
	}).compile()
	const operation = {
		input: completeRecord(input),
		kind: 'create-one',
		selection: new QueryBuilder(schema).ast.selection,
		schema: new QueryBuilder(schema).ast.schema,
	} as unknown as CreateOneOperationAst<TSchema>

	return createFinalMutationValidationStage()({
		context: validationContext,
		operation,
		previousOperation: operation,
		target: undefined,
	})
}
