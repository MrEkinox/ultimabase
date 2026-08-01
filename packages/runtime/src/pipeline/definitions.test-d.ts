import { expectTypeOf, test } from 'vitest'

import {
	runtimePipelineStage,
	type RuntimePipelineStageDefinition,
} from './definitions.js'

test('selects the exact handler contract from the pipeline stage name', () => {
	const normalization = runtimePipelineStage({
		stage: 'normalization',
		handler: (input) => input.operation,
	})
	const acl = runtimePipelineStage({
		stage: 'acl',
		handler: (input) => input.accessConstraints,
	})

	expectTypeOf(normalization).toEqualTypeOf<
		RuntimePipelineStageDefinition<'normalization'>
	>()
	expectTypeOf(acl).toEqualTypeOf<RuntimePipelineStageDefinition<'acl'>>()
})

test('rejects unknown stages and incompatible handler results', () => {
	runtimePipelineStage({
		// @ts-expect-error -- Only application-assembly pipeline positions are extensible.
		stage: 'databaseOperation',
		handler: () => undefined,
	})

	runtimePipelineStage({
		stage: 'acl',
		// @ts-expect-error -- ACL stages must return portable constraint collections.
		handler: () => undefined,
	})
})
