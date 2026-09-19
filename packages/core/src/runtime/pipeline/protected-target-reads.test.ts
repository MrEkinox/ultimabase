import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { QueryBuilder } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { RequestContext } from '../context/request-context.js'
import { createProtectedPolicyDeniedError } from '../enforcement/protected-denial.js'

const Target = Schema.define({
	className: 'ProtectedTargetRead',
	fields: () => ({}),
})
const context = RequestContext.anonymous({
	requestId: 'target-read',
	source: 'test',
})

/** No operation may reach persistence or later stages after an explicit denial. */
const unexpectedStage = (): never => {
	throw new Error('A denied read reached a later stage')
}

const createDeniedPipeline = (error: Error) => {
	const trace: string[] = []
	const pipeline = createRecordingPipeline(
		new RecordingDatabaseAdapter([], trace),
		trace,
		{},
		{
			evaluate: () => {
				throw error
			},
			reevaluate: unexpectedStage,
			enforceOperation: unexpectedStage,
			enforceSelectionResult: unexpectedStage,
			enforceResult: unexpectedStage,
		},
	)
	return { pipeline, trace }
}

describe('private protected target read semantics', () => {
	it.each(['find-one', 'exists'] as const)(
		'normalizes a proven denial only for an opted-in %s read',
		async (kind) => {
			const denial = createProtectedPolicyDeniedError()
			const { pipeline, trace } = createDeniedPipeline(denial)
			const operation = { kind, query: new QueryBuilder(Target).ast }
			await expect(pipeline.execute({ context, operation })).rejects.toBe(
				denial,
			)
			await expect(
				pipeline.execute({
					context,
					operation,
					protectedPolicyDeniedAsMissing: true,
				}),
			).resolves.toBe(kind === 'exists' ? false : null)
			expect(trace).toEqual([])
		},
	)

	it.each(['find-one', 'exists'] as const)(
		'preserves callback failures even for an opted-in %s read',
		async (kind) => {
			for (const error of [
				new FrameworkError('PERMISSION_DENIED', 'A callback denial'),
				new Error('Read failed'),
			]) {
				const { pipeline, trace } = createDeniedPipeline(error)
				await expect(
					pipeline.execute({
						context,
						operation: { kind, query: new QueryBuilder(Target).ast },
						protectedPolicyDeniedAsMissing: true,
					}),
				).rejects.toBe(error)
				expect(trace).toEqual([])
			}
		},
	)
})
