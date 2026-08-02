import {
	FrameworkApplication,
	Query,
	type SchemaMutationHookKind,
} from '../../src/index.js'
import { Schema, stringField } from '../../src/index.js'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	getCurrentEngine,
	MasterAuthority,
	type MasterKeyGrant,
	requestSources,
} from '../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineHookStages,
} from './fixtures/recording-database-adapter.js'

const articleSchema = new Schema({
	className: 'AutomaticTransactionArticle',
	fields: {
		title: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
	},
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
	const request = framework.user('author-1', {
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
		result: { id: 'created-1', title: 'Created' },
		execute: (request) =>
			request.query(articleSchema).create({ title: 'Created' }),
	},
	{
		kind: 'create-many',
		result: [{ id: 'created-1', title: 'Created' }],
		execute: (request) =>
			request.query(articleSchema).createMany([{ title: 'Created' }]),
	},
	{
		kind: 'update-one',
		result: { id: 'updated-1', title: 'After' },
		execute: (request) =>
			request
				.query(articleSchema)
				.equalTo('title', 'Before')
				.updateOne({ set: { title: 'After' } }),
	},
	{
		kind: 'update-many',
		result: 2,
		execute: (request) =>
			request
				.query(articleSchema)
				.equalTo('title', 'Before')
				.updateMany({ set: { title: 'After' } }),
	},
	{
		kind: 'upsert-one',
		result: { id: 'upserted-1', title: 'Upserted' },
		execute: (request) =>
			request
				.query(articleSchema)
				.equalTo('title', 'Upserted')
				.upsertOne({
					create: { title: 'Upserted' },
					update: { set: { title: 'Upserted' } },
				}),
	},
	{
		kind: 'upsert-many',
		result: [{ id: 'upserted-1', title: 'Upserted' }],
		execute: (request) =>
			request.query(articleSchema).upsertMany([
				{
					query: new Query(articleSchema).equalTo('title', 'Upserted'),
					create: { title: 'Upserted' },
					update: { set: { title: 'Upserted' } },
				},
			]),
	},
	{
		kind: 'delete-one',
		result: { id: 'deleted-1', title: 'Deleted' },
		execute: (request) =>
			request.query(articleSchema).equalTo('title', 'Deleted').deleteOne(),
	},
	{
		kind: 'delete-many',
		result: 2,
		execute: (request) =>
			request.query(articleSchema).equalTo('title', 'Deleted').deleteMany(),
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

			await expect(execute(request)).resolves.toBe(result)
			expect(adapter.rootRequests).toStrictEqual([])
			expect(adapter.transactions).toHaveLength(1)
			expect(adapter.transactions[0]?.requests[0]?.operation.kind).toBe(kind)
			expect(trace).toStrictEqual([
				'adapter:begin',
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
				`execute:${kind}`,
				'adapter:rollback',
			])
		},
	)

	it('makes a caught nested before-stage failure roll back the primary mutation', async () => {
		const trace: string[] = []
		const nestedError = new Error('nested hook write failed')
		const storedPrimary = { id: 'article-primary', title: 'Primary' }
		let observedEngine: ReturnType<typeof getCurrentEngine> | undefined
		const hookStages: RecordingPipelineHookStages = {
			globalBeforeHooks: async (input) => {
				if (readCreatedTitle(input.operation) === 'Primary') {
					observedEngine = getCurrentEngine()

					try {
						await observedEngine
							.query(articleSchema)
							.create({ title: 'Nested' })
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
			request.query(articleSchema).create({ title: 'Primary' }),
		).rejects.toBe(nestedError)
		expect(observedEngine).toBeDefined()
		expect(observedEngine).not.toBe(request)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
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
					await getCurrentEngine()
						.query(articleSchema)
						.create({ title: 'Nested' })
				}

				return input.operation
			},
		}
		const { request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: { id: 'article-nested', title: 'Nested' },
				},
				{ status: 'rejected', error: primaryError },
			],
			trace,
			hookStages,
		)

		await expect(
			request.query(articleSchema).create({ title: 'Primary' }),
		).rejects.toBe(primaryError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
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
					await getCurrentEngine()
						.query(articleSchema)
						.create({ title: 'Nested after' })
					throw afterError
				}

				return input.result
			},
		}
		const { request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: { id: 'article-primary', title: 'Primary' },
				},
				{
					status: 'fulfilled',
					value: { id: 'article-nested', title: 'Nested after' },
				},
			],
			trace,
			hookStages,
		)

		await expect(
			request.query(articleSchema).create({ title: 'Primary' }),
		).rejects.toBe(afterError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('keeps master elevation inside the active automatic transaction', async () => {
		const trace: string[] = []
		const authority = new MasterAuthority({
			keys: [{ id: 'maintenance', value: 'verified-secret' }],
			onUse: () => undefined,
		})
		const grants = new WeakMap<object, MasterKeyGrant>()
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
					const currentEngine = getCurrentEngine()
					const grant = grants.get(currentEngine.framework)

					if (grant === undefined) {
						throw new TypeError('Master grant fixture is unavailable')
					}

					const master = await currentEngine.useMasterKey(
						grant,
						'write automatic transaction audit',
					)

					await master.query(articleSchema).create({ title: 'Master nested' })
				}

				return input.operation
			},
		}
		const { adapter, framework, request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: { id: 'article-master', title: 'Master nested' },
				},
				{
					status: 'fulfilled',
					value: { id: 'article-primary', title: 'Primary' },
				},
			],
			trace,
			hookStages,
			authority,
		)
		grants.set(framework, framework.authorizeMasterKey('verified-secret'))

		await expect(
			request.query(articleSchema).create({ title: 'Primary' }),
		).resolves.toMatchObject({ title: 'Primary' })
		expect(nestedAccessMode).toBe('master')
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:create-one',
			'event:create-one',
		])
	})
})
