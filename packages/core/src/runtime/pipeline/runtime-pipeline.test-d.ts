import { QueryBuilder, type FindManyOperationAst } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	type DatabaseAdapter,
	type DatabaseObjectRecord,
} from '../database/contracts.js'
import { createEnforcementState } from '../enforcement/state.js'
import type {
	RuntimeBehaviorStages,
	RuntimeOperationTransformStage,
	RuntimePipelineStages,
} from './contracts.js'
import { RuntimePipeline } from './runtime-pipeline.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const operation = {
	kind: 'find-many',
	query: new QueryBuilder(articleSchema).ast,
} satisfies FindManyOperationAst<typeof articleSchema>

declare const databaseOperation: DatabaseAdapter

const stages = {
	normalization: (input) => input.operation,
	structuralValidation: (input) => input.operation,
	finalMutationValidation: (input) => input.operation,
	databaseOperation,
	commit: () => undefined,
} satisfies RuntimePipelineStages

const enforcedStages = {
	...stages,
	enforcement: {
		evaluate: () => createEnforcementState(),
		reevaluate: (input) => input.enforcement,
		enforceOperation: (input) => ({
			constraints: [],
			operation: input.operation,
		}),
		enforceSelectionResult: (input) => input.result,
		enforceResult: (input) => input.result,
	},
} satisfies RuntimePipelineStages

const communityTransform = {
	transformInput: (input) => input.operation,
} satisfies RuntimeBehaviorStages

expectTypeOf(communityTransform).toExtend<RuntimeBehaviorStages>()

const oldRevalidation: RuntimeOperationTransformStage = (input) =>
	input.operation
const legacyBehavior: RuntimeBehaviorStages = {
	// @ts-expect-error -- Final revalidation is Core-owned rather than a behavior callback.
	revalidateInput: oldRevalidation,
}
void legacyBehavior

test('preserves the exact operation result through every stage', () => {
	const pipeline = new RuntimePipeline(stages)
	const context = RequestContext.anonymous({
		requestId: 'request-1',
		source: requestSources.internal,
	})

	expectTypeOf(pipeline.execute({ context, operation })).toEqualTypeOf<
		Promise<readonly DatabaseObjectRecord<typeof articleSchema>[]>
	>()
	expectTypeOf(
		new RuntimePipeline(enforcedStages).execute({ context, operation }),
	).toEqualTypeOf<
		Promise<readonly DatabaseObjectRecord<typeof articleSchema>[]>
	>()
})

test('requires every pipeline stage during typed assembly', () => {
	const { commit: omittedStage, ...incompleteStages } = stages
	const {
		finalMutationValidation: omittedFinalValidation,
		...incompleteFinalStages
	} = stages

	expectTypeOf(omittedStage).toBeFunction()
	expectTypeOf(omittedFinalValidation).toBeFunction()
	// @ts-expect-error -- Commit remains a mandatory pipeline boundary.
	new RuntimePipeline(incompleteStages)
	// @ts-expect-error -- Final mutation validation is a mandatory Core boundary.
	new RuntimePipeline(incompleteFinalStages)
})
