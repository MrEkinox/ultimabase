import { Query, type FindOperationAst } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	type DatabaseAdapter,
	type DatabaseObjectRecord,
} from '../database/contracts.js'
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
	clp: () => undefined,
	acl: (input) => input.accessConstraints,
	fieldPermissions: (input) => ({
		operation: input.operation,
		accessConstraints: input.accessConstraints,
	}),
	globalBeforeHooks: (input) => input.operation,
	schemaBeforeHooks: (input) => input.operation,
	databaseOperation,
	schemaAfterHooks: (input) => input.result,
	globalAfterHooks: (input) => input.result,
	commit: () => undefined,
	postCommitEvents: () => undefined,
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
})

test('requires every pipeline stage during typed assembly', () => {
	const { postCommitEvents: omittedStage, ...incompleteStages } = stages

	expectTypeOf(omittedStage).toBeFunction()
	// @ts-expect-error -- Post-commit delivery is a mandatory pipeline boundary.
	new RuntimePipeline(incompleteStages)
})
