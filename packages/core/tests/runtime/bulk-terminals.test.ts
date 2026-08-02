import {
	FrameworkApplication,
	type SchemaMutationHookKind,
} from '../../src/index.js'
import { Query } from '../../src/index.js'
import { Schema, intField, stringField } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import { FrameworkEngine, requestSources } from '../../src/runtime/index.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'

const accountSchema = new Schema({
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
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const framework = new FrameworkEngine({
		application: new FrameworkApplication({
			schemas: [accountSchema],
			plugins: [],
		}),
		pipeline: createRecordingPipeline(adapter, trace),
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

		const result = await request
			.query(accountSchema)
			.createMany([
				{ email: 'first@example.com' },
				{ email: 'second@example.com' },
			])

		expect(result).toStrictEqual(created)
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

		const result = await request.query(accountSchema).upsertMany([
			{
				query: new Query(accountSchema).equalTo('email', 'first@example.com'),
				create: { email: 'first@example.com' },
				update: { increment: { visits: 1 } },
			},
			{
				query: new Query(accountSchema).equalTo('email', 'second@example.com'),
				create: { email: 'second@example.com' },
				update: { increment: { visits: 1 } },
			},
		])

		expect(result).toStrictEqual(upserted)
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
			request.query(accountSchema).createMany([{ email: 'first@example.com' }]),
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

	it('keeps explicit non-atomic grouping inside one mutation transaction', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000029',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created }],
			trace,
		)

		await expect(
			request
				.query(accountSchema)
				.createMany([{ email: 'first@example.com' }], { atomic: false }),
		).resolves.toStrictEqual(created)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-many',
			options: { atomic: false },
		})
		expectCommittedTransaction(adapter, trace, 'create-many')
	})

	it('returns counts for transactional set-based update and delete', async () => {
		const updateTrace: string[] = []
		const deleteTrace: string[] = []
		const { adapter: updateAdapter, request: updateRequest } = createRequest(
			[{ status: 'fulfilled', value: 3 }],
			updateTrace,
		)
		const { adapter: deleteAdapter, request: deleteRequest } = createRequest(
			[{ status: 'fulfilled', value: 2 }],
			deleteTrace,
		)

		const updated = await updateRequest
			.query(accountSchema)
			.greaterThan('visits', 0)
			.updateMany({ increment: { visits: 1 } })
		const deleted = await deleteRequest
			.query(accountSchema)
			.equalTo('visits', 0)
			.deleteMany()

		expect(updated).toBe(3)
		expect(deleted).toBe(2)
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

		await request.transaction((transaction) =>
			transaction
				.query(accountSchema)
				.createMany([{ email: 'first@example.com' }]),
		)

		expectCommittedTransaction(adapter, trace, 'create-many')
	})
})
