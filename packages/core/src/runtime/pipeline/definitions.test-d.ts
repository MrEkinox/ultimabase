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
	const commit = runtimePipelineStage({
		stage: 'commit',
		handler: () => undefined,
	})

	expectTypeOf(normalization).toEqualTypeOf<
		RuntimePipelineStageDefinition<'normalization'>
	>()
	expectTypeOf(commit).toEqualTypeOf<RuntimePipelineStageDefinition<'commit'>>()
})

test('rejects unknown stages and incompatible handler results', () => {
	runtimePipelineStage({
		// @ts-expect-error -- Only application-assembly pipeline positions are extensible.
		stage: 'databaseOperation',
		handler: () => undefined,
	})

	runtimePipelineStage({
		stage: 'normalization',
		// @ts-expect-error -- Normalization must preserve the exact operation type.
		handler: () => undefined,
	})

	runtimePipelineStage({
		// @ts-expect-error -- Policy plugins contribute hook effects, not named stages.
		stage: 'clp',
		handler: () => undefined,
	})
})
