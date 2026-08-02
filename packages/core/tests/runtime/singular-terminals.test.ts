import { FrameworkApplication } from '../../src/index.js'
import { Schema, intField, stringField } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import { requestSources } from '../../src/runtime/context/request-context.js'
import { FrameworkEngine } from '../../src/runtime/engine/framework-engine.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from './fixtures/recording-database-adapter.js'

const articleSchema = new Schema({
	className: 'TerminalArticle',
	fields: {
		title: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
		views: intField(),
	},
})

describe('singular BoundQuery terminals', () => {
	it('executes every terminal through the RequestEngine pipeline', async () => {
		const found = [{ id: 'article-1', title: 'Found' }]
		const createdOne = { id: 'article-2', title: 'Created one' }
		const createdAlias = { id: 'article-3', title: 'Created alias' }
		const upserted = { id: 'article-4', title: 'Upserted' }
		const results: readonly QueuedAdapterResult[] = [
			{ status: 'fulfilled', value: found },
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: 1 },
			{ status: 'fulfilled', value: true },
			{ status: 'fulfilled', value: createdOne },
			{ status: 'fulfilled', value: createdAlias },
			{ status: 'fulfilled', value: null },
			{ status: 'fulfilled', value: upserted },
			{ status: 'fulfilled', value: null },
		]
		const adapter = new RecordingDatabaseAdapter(results, [])
		const framework = new FrameworkEngine({
			application: new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
			pipeline: createRecordingPipeline(adapter, []),
		})
		const request = framework.user('user-1', {
			requestId: 'terminals-1',
			source: requestSources.internal,
		})
		const query = request
			.query(articleSchema)
			.equalTo('views', 1)
			.select('id', 'title')
		const createOneInput = { title: 'Created one' }
		const createAliasInput = { title: 'Created alias' }

		await expect(query.find()).resolves.toBe(found)
		await expect(query.first()).resolves.toBeNull()
		await expect(query.get('missing')).resolves.toBeNull()
		await expect(query.count()).resolves.toBe(1)
		await expect(query.exists()).resolves.toBe(true)
		await expect(query.createOne(createOneInput)).resolves.toBe(createdOne)
		await expect(query.create(createAliasInput)).resolves.toBe(createdAlias)
		await expect(
			query.updateOne({ increment: { views: 1 } }),
		).resolves.toBeNull()
		await expect(
			request
				.query(articleSchema)
				.equalTo('title', 'Upserted')
				.upsertOne({
					create: { title: 'Upserted' },
					update: { set: { title: 'Upserted' } },
				}),
		).resolves.toBe(upserted)
		await expect(query.deleteOne()).resolves.toBeNull()

		const requests = [
			...adapter.rootRequests,
			...adapter.transactions.flatMap((transaction) => transaction.requests),
		]

		expect(
			adapter.rootRequests.map(({ operation }) => operation.kind),
		).toStrictEqual(['find', 'first', 'get', 'count', 'exists'])
		expect(adapter.transactions).toHaveLength(5)
		expect(requests.map(({ operation }) => operation.kind)).toStrictEqual([
			'find',
			'first',
			'get',
			'count',
			'exists',
			'create-one',
			'create-one',
			'update-one',
			'upsert-one',
			'delete-one',
		])
		expect(requests[0]?.operation).toMatchObject({
			kind: 'find',
			query: query.ast,
		})
		expect(requests[2]?.operation).toMatchObject({
			kind: 'get',
			id: 'missing',
		})
		expect(requests[5]?.operation).toMatchObject({
			kind: 'create-one',
			schema: query.ast.schema,
			input: createOneInput,
		})
		expect(requests[7]?.operation).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [{ kind: 'increment', field: 'views', value: 1 }],
			},
		})
		expect(requests[8]?.operation).toMatchObject({
			kind: 'upsert-one',
			target: { fields: ['title'] },
		})
		expect(
			requests.every(
				(requestEnvelope) =>
					Object.isFrozen(requestEnvelope) &&
					Object.isFrozen(requestEnvelope.operation) &&
					Object.isFrozen(requestEnvelope.accessConstraints),
			),
		).toBe(true)
	})
})
