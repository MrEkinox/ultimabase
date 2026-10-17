import { describe, expect, it } from 'vitest'

import {
	createRequestExecutionDatabasePlugin,
	createRequestExecutionHarnessPlugin,
	runAsRequestExecutionHarness,
	type RequestExecutionHarness,
} from '../../../tests/runtime/fixtures/application-request-execution-harness.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from './ultima-base.js'

const readModelJson = (value: object): unknown => {
	const candidate = value as { readonly toJSON?: unknown }
	return typeof candidate.toJSON === 'function'
		? (candidate as { readonly toJSON: () => unknown }).toJSON()
		: value
}

describe('application request schema mutation execution', () => {
	it('executes itemized schema mutations in the exact request scope', async () => {
		const MutationRecord = UltimaBase.Schema.define({
			className: 'ApplicationRequestMutationRecord',
			fields: (field) => ({ title: field.string({ required: true }) }),
		})
		const records = ['First', 'Second', 'Third'].map((title, index) => ({
			createdAt: '2026-09-05T14:00:00.000Z',
			id: `01991f00-0000-7000-8000-00000000000${String(index + 1)}`,
			title,
			updatedAt: '2026-09-05T14:00:00.000Z',
		}))
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			records.map((record) => ({
				materializations: [{ current: record, kind: 'create' as const }],
				status: 'fulfilled' as const,
				value: { id: record.id },
			})),
			trace,
		)
		const harness: RequestExecutionHarness = {}
		const ultimabase = new (UltimaBase.use(
			createRequestExecutionHarnessPlugin(harness),
			createRequestExecutionDatabasePlugin(adapter),
		))({
			schemas: [MutationRecord],
		})
		await ultimabase.start()
		const context = runAsRequestExecutionHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'mutation-request',
				source: 'fixture-http',
			}),
		)

		const created = await runAsRequestExecutionHarness(harness, (executor) =>
			executor.executeMutation(context, MutationRecord, {
				kind: 'create-one',
				input: { data: { title: 'First' } },
			}),
		)
		const bulk = await runAsRequestExecutionHarness(harness, (executor) =>
			executor.executeMutation(context, MutationRecord, {
				kind: 'create-many',
				input: { data: [{ title: 'Second' }, { title: 'Third' }] },
			}),
		)

		// Without `select`, a write returns `{ id }` (ADR-0341).
		expect(readModelJson(created)).toStrictEqual({ id: records[0]?.id })
		expect(bulk.map(readModelJson)).toStrictEqual(
			records.slice(1).map(({ id }) => ({ id })),
		)
		expect(
			adapter.transactions.flatMap((transaction) =>
				transaction.requests.map(({ operation }) => operation.kind),
			),
		).toStrictEqual(['create-one', 'create-one', 'create-one'])
		expect(trace.filter((entry) => entry === 'adapter:commit')).toHaveLength(2)

		const controller = new AbortController()
		const cancelled = runAsRequestExecutionHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'cancelled-mutation',
				signal: controller.signal,
				source: 'fixture-http',
			}),
		)
		controller.abort('request closed')
		await expect(
			runAsRequestExecutionHarness(harness, (executor) =>
				executor.executeMutation(cancelled, MutationRecord, {
					kind: 'create-one',
					input: { data: { title: 'Cancelled' } },
				}),
			),
		).rejects.toThrow(/cancelled/u)
		expect(adapter.transactions).toHaveLength(2)
		await ultimabase.dispose()
	})
})
