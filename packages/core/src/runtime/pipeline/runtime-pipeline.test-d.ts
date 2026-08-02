import { Query, type FindOperationAst } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	type DatabaseAdapter,
	type DatabaseObjectRecord,
} from '../database/contracts.js'
import { createEnforcementState } from '../enforcement/state.js'
import type { RuntimePipelineStages } from './contracts.js'
import { RuntimePipeline } from './runtime-pipeline.js'

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const operation = {
	kind: 'find',
	query: new Query(articleSchema).ast,
} satisfies FindOperationAst<typeof articleSchema>

declare const databaseOperation: DatabaseAdapter

const stages = {
	normalization: (input) => input.operation,
	structuralValidation: (input) => input.operation,
	globalBeforeHooks: (input) => input.operation,
	schemaBeforeHooks: (input) => input.operation,
	databaseOperation,
	schemaAfterHooks: (input) => input.result,
	globalAfterHooks: (input) => input.result,
	commit: () => undefined,
	postCommitEvents: () => undefined,
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
	const { postCommitEvents: omittedStage, ...incompleteStages } = stages

	expectTypeOf(omittedStage).toBeFunction()
	// @ts-expect-error -- Post-commit delivery is a mandatory pipeline boundary.
	new RuntimePipeline(incompleteStages)
})
