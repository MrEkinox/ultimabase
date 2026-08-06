import { FrameworkApplication, increment } from '../../src/index.js'
import { Schema, intField, stringField } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import { requestSources } from '../../src/runtime/context/request-context.js'
import { runWithRequestEngine } from '../../src/runtime/context/active-framework-context.js'
import { FrameworkEngine } from '../../src/runtime/engine/framework-engine.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'TerminalArticle',
	fields: {
		title: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
		views: intField(),
	},
})

describe('read terminals and singular schema commands', () => {
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
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: selectedUpdate },
			{ status: 'fulfilled', value: upserted },
			{
				status: 'fulfilled',
				value: { id: deletedOne.id, title: deletedOne.title },
				materializations: [{ kind: 'delete', previous: deletedOne }],
			},
		]
		const adapter = new RecordingDatabaseAdapter(results, [])
		const framework = new FrameworkEngine({
			application: new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
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
			).resolves.toBeNull()
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
					where: (where) => where.eq('title', 'Updated target'),
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
				where: (where) => where.eq('title', 'Upserted'),
				create: { title: 'Upserted' },
				update: { title: 'Upserted' },
			})

			expect(upsertedResult).toBeInstanceOf(articleSchema)
			expect(upsertedResult.toJSON()).toStrictEqual(upserted)
			const deletedOneResult = await articleSchema.deleteOne({
				where: (where) => where.eq('title', 'Deleted target'),
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
					Object.isFrozen(requestEnvelope.operation) &&
					Object.isFrozen(requestEnvelope.constraints),
			),
		).toBe(true)
	})
})
