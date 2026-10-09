import { describe, expect, it } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import {
	executeOperationBatch,
	runWithQueryExecution,
} from '../../query/operations/execution.js'

import type { DatabaseAdapter } from '../database/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine } from './framework-engine.js'
import { UltimaBase } from '../application/ultima-base.js'

const BatchItem = UltimaBase.Schema.define({
	className: 'BatchItem',
	fields: (field) => ({ value: field.string() }),
})

describe('request engine batch boundary', () => {
	it('returns an empty batch without opening a transaction', async () => {
		let transactionStarts = 0
		const database: DatabaseAdapter = {
			kind: 'database-adapter',
			checkHealth: (): Promise<void> => Promise.resolve(),
			execute: () =>
				Promise.reject(new Error('Empty batch must not execute SQL')),
			beginTransaction: () => {
				transactionStarts += 1
				return Promise.reject(
					new Error('Empty batch must not start a transaction'),
				)
			},
		}
		const application = await applicationFixture(
			new FrameworkApplication({ schemas: [BatchItem], plugins: [] }),
		).initialize()
		const framework = new FrameworkEngine({
			application,
			pipeline: new RuntimePipeline({
				normalization: (input) => input.operation,
				structuralValidation: (input) => input.operation,
				finalMutationValidation: (input) => input.operation,
				databaseOperation: database,
				commit: () => undefined,
			}),
		})
		const request = framework.anonymous({
			requestId: 'empty-batch',
			source: 'internal',
		})

		try {
			const result = await runWithQueryExecution(application, request, () =>
				executeOperationBatch([], {
					context: undefined,
					useMasterKey: false,
				}),
			)

			expect(result).toStrictEqual([])
			expect(transactionStarts).toBe(0)
		} finally {
			await application.dispose()
		}
	})
})
