import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type MockInstance,
} from 'vitest'

import { FrameworkError } from '../../src/foundation.js'
import { FrameworkApplication } from '../../src/application/framework-application.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import { FrameworkEngine } from '../../src/runtime/engine/framework-engine.js'
import {
	requestSources,
	runWithRequestEngine,
} from '../../src/runtime/index.js'
import { applicationFixture } from '../application-fixture.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineBehaviorStages,
} from './fixtures/recording-database-adapter.js'

const noteSchema = UltimaBase.Schema.define({
	className: 'RetriedNote',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const stored = {
	createdAt: '2026-10-09T00:00:00.000Z',
	id: '0198f090-2a50-7000-8000-000000000101',
	title: 'Stored',
	updatedAt: '2026-10-09T00:00:00.000Z',
}

/** A conflict the adapter guarantees rolled back completely (ADR-0300). */
const conflict = (): FrameworkError =>
	new FrameworkError('TRANSACTION_CONFLICT', 'Fixture conflict.', {
		publicMessage: 'The operation conflicted with a concurrent operation.',
		retryable: true,
	})

const rejected = (error: Error): QueuedAdapterResult => ({
	error,
	status: 'rejected',
})

const createRequest = async (
	results: readonly QueuedAdapterResult[],
	behaviorStages: RecordingPipelineBehaviorStages = {},
	signal?: AbortSignal,
) => {
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const framework = new FrameworkEngine({
		application: await applicationFixture(
			new FrameworkApplication({ schemas: [noteSchema], plugins: [] }),
		).initialize(),
		pipeline: createRecordingPipeline(adapter, trace, behaviorStages),
	})
	const request = framework.anonymous({
		requestId: 'automatic-transaction-retry',
		source: requestSources.internal,
		...(signal === undefined ? {} : { signal }),
	})
	const create = () =>
		runWithRequestEngine(request, () =>
			noteSchema.createOne({ data: { title: 'Stored' } }),
		)
	return { adapter, create, request, trace }
}

describe('automatic mutation transaction retries (ADR-0300)', () => {
	let debug: MockInstance<typeof console.debug>
	let warn: MockInstance<typeof console.warn>

	beforeEach(() => {
		debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
		warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(() => {
		debug.mockRestore()
		warn.mockRestore()
	})

	it('replays every in-transaction stage and delivers post-commit effects once', async () => {
		let beforeHooks = 0
		const { adapter, create, trace } = await createRequest(
			[
				rejected(conflict()),
				rejected(conflict()),
				{ status: 'fulfilled', value: stored },
			],
			{
				beforeOperation: () => {
					beforeHooks += 1
					return undefined
				},
			},
		)

		await expect(create()).resolves.toMatchObject({ title: 'Stored' })
		expect(beforeHooks).toBe(3)
		expect(adapter.transactions).toHaveLength(3)
		expect(trace).toStrictEqual([
			...['adapter:begin', 'prepare:create-one', 'execute:create-one'],
			'adapter:rollback',
			...['adapter:begin', 'prepare:create-one', 'execute:create-one'],
			'adapter:rollback',
			...['adapter:begin', 'prepare:create-one', 'execute:create-one'],
			'adapter:commit',
			'event:create-one',
		])
		expect(debug).toHaveBeenCalledTimes(2)
		expect(debug).toHaveBeenCalledWith(
			'[UltimaBase] Retrying automatic transaction after a transient conflict',
			{
				attempt: 1,
				code: 'TRANSACTION_CONFLICT',
				operation: 'create-one',
				schema: 'RetriedNote',
			},
		)
		expect(warn).not.toHaveBeenCalled()
	})

	it('stops after three attempts and reports the retryable conflict', async () => {
		const last = conflict()
		const { adapter, create, trace } = await createRequest([
			rejected(conflict()),
			rejected(conflict()),
			rejected(last),
		])

		await expect(create()).rejects.toBe(last)
		expect(last).toMatchObject({ retryable: true })
		expect(adapter.transactions).toHaveLength(3)
		expect(trace.filter((entry) => entry === 'adapter:commit')).toEqual([])
		expect(trace).not.toContain('event:create-one')
		expect(warn).toHaveBeenCalledOnce()
		expect(warn).toHaveBeenCalledWith(
			'[UltimaBase] Automatic transaction retries exhausted',
			expect.objectContaining({ attempt: 3, operation: 'create-one' }),
		)
	})

	it.each([
		[
			'a non-retryable conflict',
			() => new FrameworkError('TRANSACTION_CONFLICT', 'Final.'),
		],
		[
			'a validation failure',
			() => new FrameworkError('VALIDATION_ERROR', 'Invalid.'),
		],
		[
			'an unknown commit outcome',
			() => new FrameworkError('TRANSACTION_ERROR', 'Unknown.'),
		],
	])('never retries %s', async (_label, failure) => {
		const error = failure()
		const { adapter, create } = await createRequest([rejected(error)])

		await expect(create()).rejects.toBe(error)
		expect(adapter.transactions).toHaveLength(1)
		expect(debug).not.toHaveBeenCalled()
	})

	it('starts no attempt after cancellation', async () => {
		const controller = new AbortController()
		const first = conflict()
		let beforeHooks = 0
		const { adapter, create } = await createRequest(
			[rejected(first), { status: 'fulfilled', value: stored }],
			{
				beforeOperation: () => {
					beforeHooks += 1
					controller.abort()
					return undefined
				},
			},
			controller.signal,
		)

		await expect(create()).rejects.toBe(first)
		expect(beforeHooks).toBe(1)
		expect(adapter.transactions).toHaveLength(1)
	})

	it('never replays an explicit transaction callback', async () => {
		const error = conflict()
		let callbacks = 0
		const { adapter, request } = await createRequest([
			rejected(error),
			{ status: 'fulfilled', value: stored },
		])

		await expect(
			request.transaction((transaction) => {
				callbacks += 1
				return runWithRequestEngine(transaction, () =>
					noteSchema.createOne({ data: { title: 'Stored' } }),
				)
			}),
		).rejects.toBe(error)
		expect(callbacks).toBe(1)
		expect(adapter.transactions).toHaveLength(1)
		expect(error.toJSON()).toMatchObject({
			code: 'TRANSACTION_CONFLICT',
			retryable: true,
		})
	})
})
