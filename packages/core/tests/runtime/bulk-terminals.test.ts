import { FrameworkApplication } from '../../src/index.js'
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

describe('bulk and upsert terminals', () => {
	it('creates ordered objects in an automatic transaction by default', async () => {
		const trace: string[] = []
		const created = [
			{ id: 'account-1', email: 'first@example.com', visits: 0 },
			{ id: 'account-2', email: 'second@example.com', visits: 0 },
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

		expect(result).toBe(created)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'create-many',
			inputs: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
			options: { atomic: true },
		})
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-many',
			'adapter:commit',
			'event:create-many',
		])
	})

	it('upserts ordered independent unique targets in one automatic transaction', async () => {
		const trace: string[] = []
		const upserted = [
			{ id: 'account-1', email: 'first@example.com', visits: 1 },
			{ id: 'account-2', email: 'second@example.com', visits: 1 },
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

		expect(result).toBe(upserted)
		expect(adapter.transactions[0]?.requests[0]?.operation).toMatchObject({
			kind: 'upsert-many',
			items: [
				{ target: { fields: ['email'] } },
				{ target: { fields: ['email'] } },
			],
			options: { atomic: true },
		})
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:upsert-many',
			'adapter:commit',
			'event:upsert-many',
		])
	})

	it('rolls back the complete atomic bulk operation when its adapter rejects', async () => {
		const trace: string[] = []
		const writeError = new Error('second object conflicts')
		const { request } = createRequest(
			[{ status: 'rejected', error: writeError }],
			trace,
		)

		await expect(
			request.query(accountSchema).createMany([{ email: 'first@example.com' }]),
		).rejects.toBe(writeError)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-many',
			'adapter:rollback',
		])
	})

	it('supports explicit non-atomic bulk execution on the root adapter', async () => {
		const trace: string[] = []
		const created = [
			{ id: 'account-1', email: 'first@example.com', visits: 0 },
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created }],
			trace,
		)

		await expect(
			request
				.query(accountSchema)
				.createMany([{ email: 'first@example.com' }], { atomic: false }),
		).resolves.toBe(created)
		expect(adapter.transactions).toStrictEqual([])
		expect(adapter.rootRequests[0]?.operation).toMatchObject({
			kind: 'create-many',
			options: { atomic: false },
		})
		expect(trace).toStrictEqual([
			'execute:create-many',
			'pipeline:commit:create-many',
			'event:create-many',
		])
	})

	it('returns counts for multi-row update and delete without implicit transactions', async () => {
		const trace: string[] = []
		const { adapter, request } = createRequest(
			[
				{ status: 'fulfilled', value: 3 },
				{ status: 'fulfilled', value: 2 },
			],
			trace,
		)

		const updated = await request
			.query(accountSchema)
			.greaterThan('visits', 0)
			.updateMany({ increment: { visits: 1 } })
		const deleted = await request
			.query(accountSchema)
			.equalTo('visits', 0)
			.deleteMany()

		expect(updated).toBe(3)
		expect(deleted).toBe(2)
		expect(adapter.transactions).toStrictEqual([])
		expect(
			adapter.rootRequests.map(({ operation }) => operation.kind),
		).toStrictEqual(['update-many', 'delete-many'])
	})

	it('reuses an explicit outer transaction instead of nesting automatic bulk work', async () => {
		const trace: string[] = []
		const created = [
			{ id: 'account-1', email: 'first@example.com', visits: 0 },
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

		expect(adapter.transactions).toHaveLength(1)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'execute:create-many',
			'adapter:commit',
			'event:create-many',
		])
	})
})
