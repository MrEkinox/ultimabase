import {
	FrameworkApplication,
	type SchemaMutationHookKind,
} from '../../src/index.js'
import { Schema, stringField } from '../../src/index.js'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	getCurrentEngine,
	MasterAuthority,
	requestSources,
	runWithRequestEngine,
} from '../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineHookStages,
} from './fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'AutomaticTransactionArticle',
	fields: {
		title: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
	},
})

const fixtureInstant = '2026-08-02T00:00:00.000Z'

/** Produces complete logical records accepted by the adapter and hook boundaries. */
const articleRecord = (id: string, title: string) => ({
	createdAt: fixtureInstant,
	id,
	title,
	updatedAt: fixtureInstant,
})

/** Narrows the generic pipeline operation before a fixture reads create input. */
const readCreatedTitle = (operation: unknown): string | undefined => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'create-one' ||
		!isPlainRecord(operation.input) ||
		typeof operation.input.title !== 'string'
	) {
		return undefined
	}

	return operation.input.title
}

/** Binds hook-stage overrides to one real adapter-backed request engine. */
const createRequest = (
	results: readonly QueuedAdapterResult[],
	trace: string[],
	hookStages: RecordingPipelineHookStages,
	masterAuthority?: MasterAuthority,
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const framework = new FrameworkEngine({
		application: new FrameworkApplication({
			schemas: [articleSchema],
			plugins: [],
		}),
		...(masterAuthority === undefined ? {} : { masterAuthority }),
		pipeline: createRecordingPipeline(adapter, trace, hookStages),
	})
	const request = framework.anonymous({
		requestId: 'automatic-transaction-1',
		source: requestSources.internal,
	})

	return { adapter, framework, request }
}

type FixtureRequest = ReturnType<typeof createRequest>['request']

interface MutationFixture {
	readonly execute: (request: FixtureRequest) => Promise<unknown>
	readonly kind: SchemaMutationHookKind
	readonly result: unknown
}

/** Exercises public terminals so the matrix cannot drift from Query normalization. */
const mutationFixtures: readonly MutationFixture[] = [
	{
		kind: 'create-one',
		result: articleRecord('0198f090-2a50-7000-8000-000000000001', 'Created'),
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'Created' }),
			),
	},
	{
		kind: 'create-many',
		result: [articleRecord('0198f090-2a50-7000-8000-000000000002', 'Created')],
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.createMany([{ title: 'Created' }]),
			),
	},
	{
		kind: 'update-one',
		result: articleRecord('0198f090-2a50-7000-8000-000000000003', 'After'),
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.updateOne({
					where: (where) => where.equalTo('title', 'Before'),
					data: { title: 'After' },
				}),
			),
	},
	{
		kind: 'update-many',
		result: 2,
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.updateMany({
					where: (where) => where.equalTo('title', 'Before'),
					data: { title: 'After' },
				}),
			),
	},
	{
		kind: 'upsert-one',
		result: articleRecord('0198f090-2a50-7000-8000-000000000004', 'Upserted'),
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.upsert({
					where: (where) => where.equalTo('title', 'Upserted'),
					create: { title: 'Upserted' },
					update: { title: 'Upserted' },
				}),
			),
	},
	{
		kind: 'upsert-many',
		result: [articleRecord('0198f090-2a50-7000-8000-000000000005', 'Upserted')],
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.upsertMany([
					{
						where: (where) => where.equalTo('title', 'Upserted'),
						create: { title: 'Upserted' },
						update: { title: 'Upserted' },
					},
				]),
			),
	},
	{
		kind: 'delete-one',
		result: articleRecord('0198f090-2a50-7000-8000-000000000006', 'Deleted'),
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.deleteOne({
					where: (where) => where.equalTo('title', 'Deleted'),
				}),
			),
	},
	{
		kind: 'delete-many',
		result: 2,
		execute: (request) =>
			runWithRequestEngine(request, () =>
				articleSchema.deleteMany({
					where: (where) => where.equalTo('title', 'Deleted'),
				}),
			),
	},
]

describe('automatic mutation transaction scope', () => {
	it.each(mutationFixtures)(
		'commits one automatic transaction for $kind',
		async ({ execute, kind, result }) => {
			const trace: string[] = []
			const { adapter, request } = createRequest(
				[{ status: 'fulfilled', value: result }],
				trace,
				{},
			)

			const outcome = await execute(request)

			expect(outcome).toEqual(result)
			if (Array.isArray(outcome)) {
				expect(
					outcome.every((article) => article instanceof articleSchema),
				).toBe(true)
			} else if (typeof outcome === 'object' && outcome !== null) {
				expect(outcome).toBeInstanceOf(articleSchema)
			}
			expect(adapter.rootRequests).toStrictEqual([])
			expect(adapter.transactions).toHaveLength(1)
			expect(adapter.transactions[0]?.requests[0]?.operation.kind).toBe(kind)
			expect(trace).toStrictEqual([
				'adapter:begin',
				`prepare:${kind}`,
				`execute:${kind}`,
				'adapter:commit',
				`event:${kind}`,
			])
		},
	)

	it.each(mutationFixtures)(
		'rolls back one automatic transaction for $kind',
		async ({ execute, kind }) => {
			const trace: string[] = []
			const writeError = new Error(`${kind} failed`)
			const { adapter, request } = createRequest(
				[{ status: 'rejected', error: writeError }],
				trace,
				{},
			)

			await expect(execute(request)).rejects.toBe(writeError)
			expect(adapter.rootRequests).toStrictEqual([])
			expect(adapter.transactions).toHaveLength(1)
			expect(adapter.transactions[0]?.requests[0]?.operation.kind).toBe(kind)
			expect(trace).toStrictEqual([
				'adapter:begin',
				`prepare:${kind}`,
				`execute:${kind}`,
				'adapter:rollback',
			])
		},
	)

	it('makes a caught nested before-stage failure roll back the primary mutation', async () => {
		const trace: string[] = []
		const nestedError = new Error('nested hook write failed')
		const storedPrimary = articleRecord(
			'0198f090-2a50-7000-8000-000000000007',
			'Primary',
		)
		let observedEngine: ReturnType<typeof getCurrentEngine> | undefined
		const hookStages: RecordingPipelineHookStages = {
			globalBeforeHooks: async (input) => {
				if (readCreatedTitle(input.operation) === 'Primary') {
					observedEngine = getCurrentEngine()

					try {
						await articleSchema.create({ title: 'Nested' })
					} catch (error: unknown) {
						expect(error).toBe(nestedError)
					}
				}

				return input.operation
			},
		}
		const { adapter, request } = createRequest(
			[
				{ status: 'rejected', error: nestedError },
				{ status: 'fulfilled', value: storedPrimary },
			],
			trace,
			hookStages,
		)

		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'Primary' }),
			),
		).rejects.toBe(nestedError)
		expect(observedEngine).toBeDefined()
		expect(observedEngine).not.toBe(request)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
		expect(() => getCurrentEngine()).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)
	})

	it('rolls back a successful before-stage write when the primary write fails', async () => {
		const trace: string[] = []
		const primaryError = new Error('primary write failed')
		const hookStages: RecordingPipelineHookStages = {
			globalBeforeHooks: async (input) => {
				if (readCreatedTitle(input.operation) === 'Primary') {
					await articleSchema.create({ title: 'Nested' })
				}

				return input.operation
			},
		}
		const { request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: articleRecord(
						'0198f090-2a50-7000-8000-000000000008',
						'Nested',
					),
				},
				{ status: 'rejected', error: primaryError },
			],
			trace,
			hookStages,
		)

		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'Primary' }),
			),
		).rejects.toBe(primaryError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('rolls back primary and nested writes when an after-stage aborts', async () => {
		const trace: string[] = []
		const afterError = new Error('after hook rejected the transaction')
		const hookStages: RecordingPipelineHookStages = {
			globalAfterHooks: async (input) => {
				if (readCreatedTitle(input.operation) === 'Primary') {
					await articleSchema.create({ title: 'Nested after' })
					throw afterError
				}

				return input.result
			},
		}
		const { request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: articleRecord(
						'0198f090-2a50-7000-8000-000000000009',
						'Primary',
					),
				},
				{
					status: 'fulfilled',
					value: articleRecord(
						'0198f090-2a50-7000-8000-000000000010',
						'Nested after',
					),
				},
			],
			trace,
			hookStages,
		)

		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'Primary' }),
			),
		).rejects.toBe(afterError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('keeps master elevation inside the active automatic transaction', async () => {
		const trace: string[] = []
		const auditReasons: string[] = []
		const authority = new MasterAuthority({
			keys: [{ id: 'maintenance', value: 'verified-secret' }],
			onUse: ({ reason }) => {
				auditReasons.push(reason)
			},
		})
		let nestedAccessMode: string | undefined
		const hookStages: RecordingPipelineHookStages = {
			globalBeforeHooks: async (input) => {
				const title = readCreatedTitle(input.operation)

				if (title === undefined) {
					return input.operation
				}

				if (title === 'Master nested') {
					nestedAccessMode = getCurrentEngine().context.access.mode
					return input.operation
				}

				if (title === 'Primary') {
					await articleSchema.create(
						{ title: 'Master nested' },
						{ useMasterKey: true },
					)
				}

				return input.operation
			},
		}
		const { adapter, request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: articleRecord(
						'0198f090-2a50-7000-8000-000000000011',
						'Master nested',
					),
				},
				{
					status: 'fulfilled',
					value: articleRecord(
						'0198f090-2a50-7000-8000-000000000012',
						'Primary',
					),
				},
			],
			trace,
			hookStages,
			authority,
		)

		await expect(
			runWithRequestEngine(request, () =>
				articleSchema.create({ title: 'Primary' }),
			),
		).resolves.toMatchObject({ title: 'Primary' })
		expect(nestedAccessMode).toBe('master')
		expect(auditReasons).toStrictEqual([
			'Query terminal create-one on AutomaticTransactionArticle',
		])
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:create-one',
			'event:create-one',
		])
	})
})
