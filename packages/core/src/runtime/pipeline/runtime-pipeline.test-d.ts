import {
	QueryBuilder,
	type FindManyOperationAst,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import { Schema, type SchemaItem } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	type DatabaseAdapter,
	type DatabaseObjectRecord,
} from '../database/contracts.js'
import { createEnforcementState } from '../enforcement/state.js'
import type {
	RuntimeBehaviorStages,
	RuntimeFinalMutationGuardStage,
	RuntimeMutationRevalidationStageInput,
	RuntimePreparedMutationStageInput,
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

const finalMutationGuard: RuntimeFinalMutationGuardStage = () => undefined
const communityGuard = {
	guardMutationInput: finalMutationGuard,
} satisfies RuntimeBehaviorStages

expectTypeOf(communityTransform).toExtend<RuntimeBehaviorStages>()
expectTypeOf(communityGuard).toExtend<RuntimeBehaviorStages>()

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

test('types prepared targets on the final mutation boundary', () => {
	type Update = UpdateOneOperationAst<typeof articleSchema>
	type Input = RuntimeMutationRevalidationStageInput<Update>
	type Article = Readonly<SchemaItem<typeof articleSchema>>

	expectTypeOf<Input['target']>().toEqualTypeOf<Article | null | undefined>()
	expectTypeOf<Input['targets']>().toEqualTypeOf<
		readonly Article[] | undefined
	>()
})

test('types final mutation guards without exposing operation replacement', () => {
	type Update = UpdateOneOperationAst<typeof articleSchema>
	type Input = RuntimePreparedMutationStageInput<Update>
	type Article = Readonly<SchemaItem<typeof articleSchema>>

	expectTypeOf<Input['operation']>().toEqualTypeOf<Update>()
	expectTypeOf<Input['target']>().toEqualTypeOf<Article | null | undefined>()
	expectTypeOf<Input['targets']>().toEqualTypeOf<
		readonly Article[] | undefined
	>()

	const invalidGuard: RuntimeFinalMutationGuardStage =
		// @ts-expect-error -- A guard cannot return an operation replacement.
		(input) => input.operation
	void invalidGuard
})
