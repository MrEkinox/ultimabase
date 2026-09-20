import { expect } from 'vitest'
import { applicationFixture } from '../../application-fixture.js'
import { FrameworkApplication, Schema } from '../../../src/index.js'

import {
	FrameworkEngine,
	requestSources,
	type DatabaseMutationOperationAst,
	type RuntimeEnforcementStages,
} from '../../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineBehaviorStages,
} from './recording-database-adapter.js'

export const managerSchema = Schema.define({
	className: 'BulkManager',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})

export const accountSchema = Schema.define({
	className: 'BulkAccount',
	fields: (field) => ({
		email: field.string({
			indexed: 'unique',
			required: true,
		}),
		manager: field.pointer({ target: 'BulkManager' }),
		reports: field.relation({ target: 'BulkAccount' }),
		visits: field.int({ default: 0 }),
	}),
})

export const fixtureInstant = '2026-08-02T00:00:00.000Z'

/** Creates complete account rows for strict adapter result validation. */
export const accountRecord = (id: string, email: string, visits: number) => ({
	createdAt: fixtureInstant,
	email,
	id,
	updatedAt: fixtureInstant,
	visits,
})

/** Binds bulk terminals to the real request engine and transaction pipeline. */
export const createRequest = async (
	results: readonly QueuedAdapterResult[],
	trace: string[],
	behaviors: RecordingPipelineBehaviorStages = {},
	enforcement?: RuntimeEnforcementStages,
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const application = await applicationFixture(
		new FrameworkApplication({
			schemas: [managerSchema, accountSchema],
			plugins: [],
		}),
	).initialize()

	application.compileSchemas()
	const framework = new FrameworkEngine({
		application,
		pipeline: createRecordingPipeline(adapter, trace, behaviors, enforcement),
	})
	const request = framework.anonymous({
		requestId: 'bulk-1',
		source: requestSources.internal,
	})

	return { adapter, request }
}

/** Verifies the common lifecycle shared by every committed root mutation. */
export const expectCommittedTransaction = (
	adapter: RecordingDatabaseAdapter,
	trace: readonly string[],
	kinds: readonly DatabaseMutationOperationAst['kind'][],
): void => {
	expect(adapter.rootRequests).toStrictEqual([])
	expect(adapter.transactions).toHaveLength(1)
	expect(
		adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
	).toStrictEqual(kinds)
	expect(trace).toStrictEqual([
		'adapter:begin',
		...kinds.flatMap((kind) => [`prepare:${kind}`, `execute:${kind}`]),
		'adapter:commit',
		...kinds.map((kind) => `event:${kind}`),
	])
}
