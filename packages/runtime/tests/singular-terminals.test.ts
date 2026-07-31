import { FrameworkApplication } from '@ultimabase/core'
import { defineSchema, intField, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { requestSources } from '../src/context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
} from '../src/database/contracts.js'
import {
	FrameworkEngine,
	type RequestTransactionRunner,
} from '../src/engine/framework-engine.js'
import type { RuntimePipelineStages } from '../src/pipeline/contracts.js'
import { RuntimePipeline } from '../src/pipeline/runtime-pipeline.js'

const articleSchema = defineSchema({
	className: 'TerminalArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

/** Returns operation-correlated fixture values while recording adapter requests. */
class QueuedDatabaseExecutor implements DatabaseOperationExecutor {
	readonly requests: DatabaseOperationRequest[] = []
	readonly #results: unknown[]

	constructor(results: readonly unknown[]) {
		this.#results = [...results]
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		const result: unknown = this.#results.shift()

		// Each queued value is paired with the exact terminal invoked by this test.
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}
}

/** Builds the real mandatory pipeline with explicit neutral capability stages. */
const createPipeline = (
	databaseOperation: DatabaseOperationExecutor,
): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		clp: () => undefined,
		acl: (input) => input.accessConstraints,
		fieldPermissions: (input) => ({
			operation: input.operation,
			accessConstraints: input.accessConstraints,
		}),
		globalBeforeHooks: (input) => input.operation,
		schemaBeforeHooks: (input) => input.operation,
		databaseOperation,
		schemaAfterHooks: (input) => input.result,
		globalAfterHooks: (input) => input.result,
		commit: () => undefined,
		postCommitEvents: () => undefined,
	}

	return new RuntimePipeline(stages)
}

/** Retains the current engine until issue 317 binds adapter transactions. */
const transactionRunner: RequestTransactionRunner = async (engine, handler) =>
	handler(engine)

describe('singular BoundQuery terminals', () => {
	it('executes every terminal through the RequestEngine pipeline', async () => {
		const found = [{ id: 'article-1', title: 'Found' }]
		const createdOne = { id: 'article-2', title: 'Created one' }
		const createdAlias = { id: 'article-3', title: 'Created alias' }
		const executor = new QueuedDatabaseExecutor([
			found,
			null,
			null,
			1,
			true,
			createdOne,
			createdAlias,
			null,
			null,
		])
		const framework = new FrameworkEngine({
			application: new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
			pipeline: createPipeline(executor),
			transactionRunner,
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
		await expect(query.deleteOne()).resolves.toBeNull()

		expect(
			executor.requests.map(({ operation }) => operation.kind),
		).toStrictEqual([
			'find',
			'first',
			'get',
			'count',
			'exists',
			'create-one',
			'create-one',
			'update-one',
			'delete-one',
		])
		expect(executor.requests[0]?.operation).toMatchObject({
			kind: 'find',
			query: query.ast,
		})
		expect(executor.requests[2]?.operation).toMatchObject({
			kind: 'get',
			id: 'missing',
		})
		expect(executor.requests[5]?.operation).toMatchObject({
			kind: 'create-one',
			schema: query.ast.schema,
			input: createOneInput,
		})
		expect(executor.requests[7]?.operation).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [{ kind: 'increment', field: 'views', value: 1 }],
			},
		})
		expect(
			executor.requests.every(
				(requestEnvelope) =>
					Object.isFrozen(requestEnvelope) &&
					Object.isFrozen(requestEnvelope.operation) &&
					Object.isFrozen(requestEnvelope.accessConstraints),
			),
		).toBe(true)
	})
})
