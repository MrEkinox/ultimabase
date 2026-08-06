import {
	FrameworkApplication,
	increment,
	type SchemaMutationHookKind,
} from '../../src/index.js'
import { Schema, intField, stringField } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	requestSources,
	runWithRequestEngine,
} from '../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineHookStages,
} from './fixtures/recording-database-adapter.js'

const accountSchema = Schema.define({
	className: 'BulkAccount',
	fields: {
		email: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
		visits: intField({ default: 0 }),
	},
})

const fixtureInstant = '2026-08-02T00:00:00.000Z'

/** Creates complete account rows for strict adapter result validation. */
const accountRecord = (id: string, email: string, visits: number) => ({
	createdAt: fixtureInstant,
	email,
	id,
	updatedAt: fixtureInstant,
	visits,
})

/** Binds bulk terminals to the real request engine and transaction pipeline. */
const createRequest = (
	results: readonly QueuedAdapterResult[],
	trace: string[],
	hookStages: RecordingPipelineHookStages = {},
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const framework = new FrameworkEngine({
		application: new FrameworkApplication({
			schemas: [accountSchema],
			plugins: [],
		}),
		pipeline: createRecordingPipeline(adapter, trace, hookStages),
	})
	const request = framework.anonymous({
		requestId: 'bulk-1',
		source: requestSources.internal,
	})

	return { adapter, request }
}

/** Verifies the common lifecycle shared by every committed root mutation. */
const expectCommittedTransaction = (
	adapter: RecordingDatabaseAdapter,
	trace: readonly string[],
	kind: SchemaMutationHookKind,
): void => {
	expect(adapter.rootRequests).toStrictEqual([])
	expect(adapter.transactions).toHaveLength(1)
	expect(adapter.transactions[0]?.requests).toHaveLength(1)
	expect(adapter.transactions[0]?.requests[0]?.operation.kind).toBe(kind)
	expect(trace).toStrictEqual([
		'adapter:begin',
		`prepare:${kind}`,
		`execute:${kind}`,
		'adapter:commit',
		`event:${kind}`,
	])
}

describe('bulk and upsert terminals', () => {
	it('creates ordered objects in an automatic transaction by default', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000025',
				'first@example.com',
				0,
			),
			accountRecord(
				'0198f090-2a50-7000-8000-000000000026',
				'second@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created }],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.createMany([
				{ email: 'first@example.com' },
				{ email: 'second@example.com' },
			]),
		)

		expect(result.every((account) => account instanceof accountSchema)).toBe(
			true,
		)
		expect(result.map((account) => account.toJSON())).toStrictEqual(created)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-many',
			inputs: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
			options: { atomic: true },
		})
		expectCommittedTransaction(adapter, trace, 'create-many')
	})

	it('upserts ordered independent unique targets in one automatic transaction', async () => {
		const trace: string[] = []
		const upserted = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000027',
				'first@example.com',
				1,
			),
			accountRecord(
				'0198f090-2a50-7000-8000-000000000028',
				'second@example.com',
				1,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: upserted }],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.upsertMany([
				{
					where: (where) => where.eq('email', 'first@example.com'),
					create: { email: 'first@example.com' },
					update: { visits: increment(1) },
				},
				{
					where: (where) => where.eq('email', 'second@example.com'),
					create: { email: 'second@example.com' },
					update: { visits: increment(1) },
				},
			]),
		)

		expect(result.every((account) => account instanceof accountSchema)).toBe(
			true,
		)
		expect(result.map((account) => account.toJSON())).toStrictEqual(upserted)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'upsert-many',
			items: [
				{ target: { fields: ['email'] } },
				{ target: { fields: ['email'] } },
			],
			options: { atomic: true },
		})
		expectCommittedTransaction(adapter, trace, 'upsert-many')
	})

	it('rolls back the complete atomic bulk operation when its adapter rejects', async () => {
		const trace: string[] = []
		const writeError = new Error('second object conflicts')
		const { adapter, request } = createRequest(
			[{ status: 'rejected', error: writeError }],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany([{ email: 'first@example.com' }]),
			),
		).rejects.toBe(writeError)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests[0]?.operation.kind).toBe(
			'create-many',
		)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-many',
			'execute:create-many',
			'adapter:rollback',
		])
	})

	it('rolls back the complete atomic collection when an after hook rejects', async () => {
		const trace: string[] = []
		const hookError = new Error('bulk result rejected')
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000032',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created }],
			trace,
			{
				schemaAfterHooks: () => Promise.reject(hookError),
			},
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany([{ email: 'first@example.com' }]),
			),
		).rejects.toBe(hookError)
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-many',
			'execute:create-many',
			'adapter:rollback',
		])
	})

	it('returns a completed wrapper after one non-atomic collection transaction', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000029',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: { results: created, status: 'completed' },
				},
			],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.createMany([{ email: 'first@example.com' }], {
				atomic: false,
			}),
		)

		expect(result.status).toBe('completed')
		expect(
			result.results.every((account) => account instanceof accountSchema),
		).toBe(true)
		expect(result.results.map((account) => account.toJSON())).toStrictEqual(
			created,
		)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-many',
			options: { atomic: false },
		})
		expectCommittedTransaction(adapter, trace, 'create-many')
	})

	it('commits and reports only the successful prefix after a non-atomic stop', async () => {
		const trace: string[] = []
		const writeError = new Error('second object conflicts')
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000031',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: {
						error: writeError,
						failedIndex: 1,
						results: created,
						status: 'stopped',
					},
				},
			],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.createMany(
				[{ email: 'first@example.com' }, { email: 'second@example.com' }],
				{ atomic: false },
			),
		)

		expect(result.status).toBe('stopped')

		if (result.status !== 'stopped') {
			throw new TypeError('Expected a stopped non-atomic result')
		}

		expect(result.error).toBe(writeError)
		expect(result.failedIndex).toBe(1)
		expect(result.results).toHaveLength(1)
		expect(result.results[0]).toBeInstanceOf(accountSchema)
		expect(result.results[0]?.toJSON()).toStrictEqual(created[0])
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expectCommittedTransaction(adapter, trace, 'create-many')
	})

	it('rolls back a stopped prefix when a remaining result hook rejects', async () => {
		const trace: string[] = []
		const writeError = new Error('second object conflicts')
		const hookError = new Error('partial import rejected')
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000033',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[
				{
					status: 'fulfilled',
					value: {
						error: writeError,
						failedIndex: 1,
						results: created,
						status: 'stopped',
					},
				},
			],
			trace,
			{ schemaAfterHooks: () => Promise.reject(hookError) },
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany(
					[{ email: 'first@example.com' }, { email: 'second@example.com' }],
					{ atomic: false },
				),
			),
		).rejects.toBe(hookError)
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-many',
			'execute:create-many',
			'adapter:rollback',
		])
	})

	it('returns identifier models for transactional set-based update and delete', async () => {
		const updateTrace: string[] = []
		const deleteTrace: string[] = []
		const beforeKinds: string[] = []
		const afterKinds: string[] = []
		const hookStages: RecordingPipelineHookStages = {
			schemaAfterHooks: (input) => {
				afterKinds.push(input.operation.kind)

				return input.result
			},
			schemaBeforeHooks: (input) => {
				beforeKinds.push(input.operation.kind)

				return input.operation
			},
		}
		const { adapter: updateAdapter, request: updateRequest } = createRequest(
			[
				{
					status: 'fulfilled',
					value: [
						{ id: '0198f090-2a50-7000-8000-000000000040', visits: 1 },
						{ id: '0198f090-2a50-7000-8000-000000000041', visits: 2 },
						{ id: '0198f090-2a50-7000-8000-000000000042', visits: 3 },
					],
				},
			],
			updateTrace,
			hookStages,
		)
		const { adapter: deleteAdapter, request: deleteRequest } = createRequest(
			[
				{
					status: 'fulfilled',
					value: [
						{ id: '0198f090-2a50-7000-8000-000000000043' },
						{ id: '0198f090-2a50-7000-8000-000000000044' },
					],
				},
			],
			deleteTrace,
			hookStages,
		)

		const updated = await runWithRequestEngine(updateRequest, () =>
			accountSchema.updateMany({
				where: (where) => where.gt('visits', 0),
				data: { visits: increment(1) },
				select: { id: true, visits: true },
			}),
		)
		const deleted = await runWithRequestEngine(deleteRequest, () =>
			accountSchema.deleteMany({
				where: (where) => where.eq('visits', 0),
			}),
		)

		expect(updated.map((item) => item.toJSON())).toStrictEqual([
			{ id: '0198f090-2a50-7000-8000-000000000040', visits: 1 },
			{ id: '0198f090-2a50-7000-8000-000000000041', visits: 2 },
			{ id: '0198f090-2a50-7000-8000-000000000042', visits: 3 },
		])
		expect(deleted.map((item) => item.toJSON())).toStrictEqual([
			{ id: '0198f090-2a50-7000-8000-000000000043' },
			{ id: '0198f090-2a50-7000-8000-000000000044' },
		])
		expect(beforeKinds).toStrictEqual(['update-many', 'delete-many'])
		expect(afterKinds).toStrictEqual(['update-many', 'delete-many'])
		expectCommittedTransaction(updateAdapter, updateTrace, 'update-many')
		expectCommittedTransaction(deleteAdapter, deleteTrace, 'delete-many')
	})

	it('reuses an explicit outer transaction instead of nesting automatic bulk work', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000030',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created }],
			trace,
		)

		await request.transaction(() =>
			accountSchema.createMany([{ email: 'first@example.com' }]),
		)

		expectCommittedTransaction(adapter, trace, 'create-many')
	})
})
