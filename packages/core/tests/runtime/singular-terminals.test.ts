import { applicationFixture } from '../application-fixture.js'
import {
	increment,
	QueryBuilder,
	type ExecutableOperationAst,
} from '../../src/index.js'
import { FrameworkApplication } from '../../src/application/framework-application.js'

import { describe, expect, it } from 'vitest'

import { requestSources } from '../../src/runtime/context/request-context.js'
import { runWithRequestEngine } from '../../src/runtime/context/active-framework-context.js'
import { FrameworkEngine } from '../../src/runtime/engine/framework-engine.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'TerminalArticle',
	fields: (field) => ({
		title: field.string({
			indexed: 'unique',
			required: true,
		}),
		views: field.int(),
	}),
})

describe('read terminals and singular schema commands', () => {
	it('normalizes singular identifier aliases into canonical where operations', async () => {
		const objectId = '0198f090-2a50-7000-8000-000000000019'
		const results: readonly QueuedAdapterResult[] = [
			{ status: 'fulfilled', target: null, value: null },
			{ status: 'fulfilled', target: null, value: null },
			{ status: 'fulfilled', target: null, value: null },
			{ status: 'fulfilled', target: null, value: null },
		]
		const adapter = new RecordingDatabaseAdapter(results, [])
		const framework = new FrameworkEngine({
			application: await applicationFixture(
				new FrameworkApplication({
					schemas: [articleSchema],
					plugins: [],
				}),
			).initialize(),
			pipeline: createRecordingPipeline(adapter, []),
		})
		const request = framework.anonymous({
			requestId: 'singular-id-aliases',
			source: requestSources.internal,
		})

		await runWithRequestEngine(request, async () => {
			await expect(
				articleSchema.updateOne({ id: objectId, data: { views: 1 } }),
			).resolves.toBeNull()
			await expect(
				articleSchema.updateOne({
					where: { id: { eq: objectId } },
					data: { views: 1 },
				}),
			).resolves.toBeNull()
			await expect(
				articleSchema.deleteOne({ id: objectId }),
			).resolves.toBeNull()
			await expect(
				articleSchema.deleteOne({ where: { id: { eq: objectId } } }),
			).resolves.toBeNull()
		})

		const operations = adapter.transactions.flatMap((transaction) =>
			transaction.requests.map(
				({ operation }) => operation as unknown as ExecutableOperationAst,
			),
		)
		const whereNodes = operations.map((operation) =>
			operation.kind === 'update-one' || operation.kind === 'delete-one'
				? operation.query.where
				: undefined,
		)

		expect(operations.map(({ kind }) => kind)).toStrictEqual([
			'update-one',
			'update-one',
			'delete-one',
			'delete-one',
		])
		expect(whereNodes[0]).toStrictEqual(whereNodes[1])
		expect(whereNodes[2]).toStrictEqual(whereNodes[3])
		expect(whereNodes[0]).toStrictEqual(whereNodes[2])
	})

	it('rejects missing targets for get and persisted model commands', async () => {
		const trace: string[] = []
		const persisted = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000020',
			title: 'Persisted',
			updatedAt: '2026-08-02T00:00:00.000Z',
			views: null,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: persisted, kind: 'create' }],
					status: 'fulfilled',
					value: persisted,
				},
				{ status: 'fulfilled', value: true },
				{ status: 'fulfilled', value: null },
				{ status: 'fulfilled', target: null, value: null },
				{ status: 'fulfilled', target: null, value: null },
			],
			trace,
		)
		const framework = new FrameworkEngine({
			application: await applicationFixture(
				new FrameworkApplication({
					schemas: [articleSchema],
					plugins: [],
				}),
			).initialize(),
			pipeline: createRecordingPipeline(adapter, trace),
		})
		const request = framework.anonymous({
			requestId: 'strict-targets',
			source: requestSources.internal,
		})

		await runWithRequestEngine(request, async () => {
			const article = await articleSchema.createOne({
				data: { title: persisted.title },
			})

			await expect(article.exists()).resolves.toBe(true)
			await expect(article.fetch({})).rejects.toMatchObject({
				code: 'NOT_FOUND',
			})
			await expect(
				article.update({ data: { title: 'Missing' } }),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(article.delete({})).rejects.toMatchObject({
				code: 'NOT_FOUND',
			})
		})

		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
			'event:create-one',
			'execute:exists',
			'pipeline:commit:exists',
			'event:exists',
			'execute:get',
			'adapter:begin',
			'prepare:update-one',
			'adapter:rollback',
			'adapter:begin',
			'prepare:delete-one',
			'adapter:rollback',
		])

		const expectedQuery = new QueryBuilder(articleSchema).where({
			id: { eq: persisted.id },
		}).ast
		const requests = [
			...adapter.rootRequests,
			...adapter.transactions.flatMap(({ requests }) => requests),
		].filter(({ operation }) => operation.kind !== 'create-one')

		expect(requests.map(({ operation }) => operation.kind)).toStrictEqual([
			'exists',
			'get',
			'update-one',
			'delete-one',
		])
		for (const request of requests) {
			const operation = request.operation as ExecutableOperationAst
			expect(operation).toHaveProperty('query', expectedQuery)
			expect(request.rowFilter).toStrictEqual(expectedQuery.where?.expression)
		}
	})

	it('executes reads and writes through the RequestEngine pipeline', async () => {
		const found = [
			{ id: '0198f090-2a50-7000-8000-000000000021', title: 'Found' },
		]
		const createdOne = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000022',
			title: 'Created one',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		const upserted = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000024',
			title: 'Upserted',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		const selectedUpdate = {
			id: '0198f090-2a50-7000-8000-000000000023',
			title: 'Selected update',
		}
		const selectedUpdatePrevious = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: selectedUpdate.id,
			title: 'Unique',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		const selectedUpdateCurrent = {
			...selectedUpdatePrevious,
			title: selectedUpdate.title,
		}
		const deletedOne = {
			createdAt: '2026-08-02T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000025',
			title: 'Deleted target',
			updatedAt: '2026-08-02T00:00:00.000Z',
		}
		const results: readonly QueuedAdapterResult[] = [
			{ status: 'fulfilled', value: found },
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: 1 },
			{ status: 'fulfilled', value: true },
			{
				status: 'fulfilled',
				value: { id: createdOne.id, title: createdOne.title },
				materializations: [{ current: createdOne, kind: 'create' }],
			},
			{ status: 'fulfilled', target: null, value: null },
			{
				status: 'fulfilled',
				target: selectedUpdatePrevious,
				value: selectedUpdate,
				materializations: [
					{
						current: selectedUpdateCurrent,
						kind: 'update',
						previous: selectedUpdatePrevious,
					},
				],
			},
			{ status: 'fulfilled', value: upserted },
			{
				status: 'fulfilled',
				target: deletedOne,
				value: { id: deletedOne.id, title: deletedOne.title },
				materializations: [{ kind: 'delete', previous: deletedOne }],
			},
		]
		const adapter = new RecordingDatabaseAdapter(results, [])
		const framework = new FrameworkEngine({
			application: await applicationFixture(
				new FrameworkApplication({
					schemas: [articleSchema],
					plugins: [],
				}),
			).initialize(),
			pipeline: createRecordingPipeline(adapter, []),
		})
		const request = framework.anonymous({
			requestId: 'terminals-1',
			source: requestSources.internal,
		})
		const readInput = {
			where: { views: { eq: 1 } },
			select: { id: true, title: true },
		} as const
		const createOneInput = { title: 'Created one' }

		await runWithRequestEngine(request, async () => {
			const foundResult = await articleSchema.findMany(readInput)

			expect(foundResult).toHaveLength(1)
			expect(foundResult[0]).toBeInstanceOf(articleSchema)
			expect(foundResult.map((article) => article.toJSON())).toStrictEqual(
				found,
			)
			await expect(articleSchema.findOne(readInput)).resolves.toBeNull()
			await expect(
				articleSchema.get({ id: 'missing', select: readInput.select }),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(
				articleSchema.count({ where: readInput.where }),
			).resolves.toBe(1)
			await expect(
				articleSchema.exists({ where: readInput.where }),
			).resolves.toBe(true)
			const createdOneResult = await articleSchema.createOne({
				data: createOneInput,
				select: { id: true, title: true },
			})

			expect(createdOneResult).toBeInstanceOf(articleSchema)
			expect(createdOneResult.toJSON()).toStrictEqual({
				id: createdOne.id,
				title: createdOne.title,
			})
			await expect(
				articleSchema.updateOne({
					where: { title: { eq: 'Updated target' } },
					data: { views: increment(1) },
				}),
			).resolves.toBeNull()
			const selectedUpdateResult = await articleSchema.updateOne({
				where: { title: { eq: 'Unique' } },
				data: { title: 'Selected update' },
				select: { id: true, title: true },
			})

			expect(selectedUpdateResult).toBeInstanceOf(articleSchema)
			expect(selectedUpdateResult?.toJSON()).toStrictEqual(selectedUpdate)
			const upsertedResult = await articleSchema.upsertOne({
				where: { title: { eq: 'Upserted' } },
				create: { title: 'Upserted' },
				update: { title: 'Upserted' },
			})

			expect(upsertedResult).toBeInstanceOf(articleSchema)
			expect(upsertedResult.toJSON()).toStrictEqual(upserted)
			const deletedOneResult = await articleSchema.deleteOne({
				where: { title: { eq: 'Deleted target' } },
				select: { id: true, title: true },
			})

			expect(deletedOneResult).toBeInstanceOf(articleSchema)
			expect(deletedOneResult?.toJSON()).toStrictEqual({
				id: deletedOne.id,
				title: deletedOne.title,
			})
		})

		const requests = [
			...adapter.rootRequests,
			...adapter.transactions.flatMap((transaction) => transaction.requests),
		]

		expect(
			adapter.rootRequests.map(({ operation }) => operation.kind),
		).toStrictEqual(['find-many', 'find-one', 'get', 'count', 'exists'])
		expect(adapter.transactions).toHaveLength(5)
		expect(requests.map(({ operation }) => operation.kind)).toStrictEqual([
			'find-many',
			'find-one',
			'get',
			'count',
			'exists',
			'create-one',
			'update-one',
			'update-one',
			'upsert-one',
			'delete-one',
		])
		expect(requests[0]?.operation).toMatchObject({
			kind: 'find-many',
			query: {
				selection: {
					fields: [
						{ field: 'id', kind: 'selected-field' },
						{ field: 'title', kind: 'selected-field' },
					],
				},
			},
		})
		expect(requests[2]?.operation).toMatchObject({
			kind: 'get',
			id: 'missing',
		})
		expect(requests[5]?.operation).toMatchObject({
			kind: 'create-one',
			selection: {
				fields: [
					{ field: 'id', kind: 'selected-field' },
					{ field: 'title', kind: 'selected-field' },
				],
				kind: 'selection',
			},
			schema: { definition: articleSchema, kind: 'schema' },
			input: createOneInput,
		})
		expect(requests[6]?.operation).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [{ kind: 'increment', field: 'views', value: 1 }],
			},
		})
		expect(requests[7]?.operation).toMatchObject({
			kind: 'update-one',
			query: {
				selection: {
					fields: [
						{ field: 'id', kind: 'selected-field' },
						{ field: 'title', kind: 'selected-field' },
					],
				},
			},
		})
		expect(requests[8]?.operation).toMatchObject({
			kind: 'upsert-one',
			target: { fields: ['title'] },
		})
		expect(requests[9]?.operation).toMatchObject({
			kind: 'delete-one',
			query: {
				selection: {
					fields: [
						{ field: 'id', kind: 'selected-field' },
						{ field: 'title', kind: 'selected-field' },
					],
				},
			},
		})
		expect(
			requests.every(
				(requestEnvelope) =>
					Object.isFrozen(requestEnvelope) &&
					Object.isFrozen(requestEnvelope.operation),
			),
		).toBe(true)
	})
})
