import { FrameworkApplication, FrameworkError } from '@ultimabase/core'
import {
	Query,
	type CreateOneOperationAst,
	type FindOperationAst,
} from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseAdapter,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	createTrustedMasterRequestEngine,
	FrameworkEngine,
	RequestEngine,
} from './framework-engine.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const matchingClassSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const articleOperation = {
	kind: 'find',
	query: new Query(articleSchema).limit(10).ast,
} satisfies FindOperationAst<typeof articleSchema>

/** Returns deterministic fixture data for every generic adapter call. */
class FixtureDatabaseExecutor implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly operations: DatabaseOperationAst[] = []
	commits = 0
	rollbacks = 0

	constructor(private readonly fixtureResult: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.operations.push(request.operation)

		// The fixture is selected alongside the exact operation used by each test.
		return Promise.resolve(
			this.fixtureResult as DatabaseOperationResult<TOperation>,
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction: DatabaseTransactionAdapter = {
			kind: 'database-transaction-adapter',
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => this.execute(request),
			commit: (): Promise<void> => {
				this.commits += 1

				return Promise.resolve()
			},
			rollback: (): Promise<void> => {
				this.rollbacks += 1

				return Promise.resolve()
			},
		}

		return Promise.resolve(transaction)
	}
}

/** Creates explicit neutral stages so engine tests still use the real pipeline. */
const createPipeline = (
	databaseOperation: DatabaseOperationExecutor,
	contexts: RequestContext[] = [],
): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => {
			contexts.push(input.context)

			return input.operation
		},
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

const createFixtureFramework = (
	schema: typeof articleSchema | typeof matchingClassSchema,
	fixtureResult: unknown = [],
	contexts: RequestContext[] = [],
): FrameworkEngine<readonly [typeof schema], readonly []> => {
	const application = new FrameworkApplication({
		schemas: [schema],
		plugins: [],
	})

	return new FrameworkEngine({
		application,
		pipeline: createPipeline(
			new FixtureDatabaseExecutor(fixtureResult),
			contexts,
		),
	})
}

describe('FrameworkEngine', () => {
	it('creates immutable anonymous and authenticated request engines', () => {
		const framework = createFixtureFramework(articleSchema)
		const anonymous = framework.anonymous({
			requestId: 'anonymous-1',
			source: requestSources.rest,
		})
		const user = framework.user('user-1', {
			requestId: 'user-1',
			source: requestSources.graphql,
		})

		expect(anonymous).toBeInstanceOf(RequestEngine)
		expect(anonymous.application).toBe(framework.application)
		expect(anonymous.framework).toBe(framework)
		expect(anonymous.context.access).toStrictEqual({ mode: 'anonymous' })
		expect(user.context.access).toStrictEqual({
			mode: 'user',
			userId: 'user-1',
		})
		expect(Object.isFrozen(framework)).toBe(true)
		expect(Object.isFrozen(user)).toBe(true)
	})

	it('binds immutable queries only to schemas owned by the application', () => {
		const framework = createFixtureFramework(articleSchema)
		const request = framework.user('user-1', {
			requestId: 'query-1',
			source: requestSources.internal,
		})
		const query = request.query(articleSchema).equalTo('title', 'UltimaBase')

		expect(query.engine).toBe(request)
		expect(query.schema).toBe(articleSchema)
		expect(query.ast.where).toBeDefined()
		expect(() => request.query(matchingClassSchema)).toThrow(
			new FrameworkError(
				'VALIDATION_ERROR',
				'Schema does not belong to this application: Article',
				{
					publicMessage: 'The requested schema is not available.',
					internalDetails: { className: 'Article' },
				},
			),
		)
		expect(() =>
			// @ts-expect-error -- Runtime validation protects JavaScript callers.
			request.query(undefined),
		).toThrow(
			new FrameworkError(
				'VALIDATION_ERROR',
				'Schema does not belong to this application: unknown',
				{
					publicMessage: 'The requested schema is not available.',
					internalDetails: { className: 'unknown' },
				},
			),
		)
	})

	it('executes normalized operations with the exact request context', async () => {
		const contexts: RequestContext[] = []
		const articles = [{ title: 'UltimaBase' }]
		const framework = createFixtureFramework(articleSchema, articles, contexts)
		const request = framework.user('user-1', {
			requestId: 'execute-1',
			source: requestSources.internal,
		})

		await expect(request.execute(articleOperation)).resolves.toBe(articles)
		expect(contexts).toStrictEqual([request.context])

		const foreignOperation = {
			kind: 'find',
			query: new Query(matchingClassSchema).ast,
		} satisfies FindOperationAst<typeof matchingClassSchema>

		expect(() => request.execute(foreignOperation)).toThrow(FrameworkError)
		for (const invalidOperation of [
			null,
			{},
			{ schema: { kind: 'invalid', definition: articleSchema } },
			{ schema: { kind: 'schema' } },
		]) {
			expect(() =>
				// @ts-expect-error -- Runtime validation protects malformed operations.
				request.execute(invalidOperation),
			).toThrow(
				new FrameworkError(
					'VALIDATION_ERROR',
					'Operation does not contain a normalized schema node.',
					{ publicMessage: 'The operation is invalid.' },
				),
			)
		}
	})

	it('executes schema-backed operations through the same owned pipeline', async () => {
		const createdArticle = { title: 'Created' }
		const framework = createFixtureFramework(articleSchema, createdArticle)
		const request = framework.user('user-1', {
			requestId: 'create-1',
			source: requestSources.internal,
		})
		const operation = {
			kind: 'create-one',
			schema: new Query(articleSchema).ast.schema,
			input: { title: 'Created' },
		} satisfies CreateOneOperationAst<typeof articleSchema>

		await expect(request.execute(operation)).resolves.toBe(createdArticle)
	})

	it('delegates transaction callbacks without losing request identity', async () => {
		const framework = createFixtureFramework(articleSchema)
		const request = framework.user('user-1', {
			requestId: 'transaction-1',
			source: requestSources.internal,
		})

		await expect(
			request.transaction((transaction) => {
				expect(transaction).not.toBe(request)
				expect(transaction.context).toBe(request.context)
				expect(transaction.framework).toBe(request.framework)

				return 'completed' as const
			}),
		).resolves.toBe('completed')

		expect(() =>
			// @ts-expect-error -- Runtime validation protects JavaScript callbacks.
			request.transaction(undefined),
		).toThrow(
			new TypeError('Request engine transaction handler must be a function'),
		)
	})

	it('keeps trusted master construction internal and reason-bound', () => {
		const framework = createFixtureFramework(articleSchema)
		const request = createTrustedMasterRequestEngine(
			framework,
			'backfill verified articles',
			{
				requestId: 'master-1',
				source: requestSources.internal,
			},
		)

		expect(request.context.access).toStrictEqual({
			mode: 'master',
			reason: 'backfill verified articles',
		})
	})

	it.concurrent(
		'isolates parallel applications even when schemas share a class name',
		async () => {
			const firstContexts: RequestContext[] = []
			const secondContexts: RequestContext[] = []
			const firstFramework = createFixtureFramework(
				articleSchema,
				[{ title: 'first' }],
				firstContexts,
			)
			const secondFramework = createFixtureFramework(
				matchingClassSchema,
				[{ title: 'second' }],
				secondContexts,
			)
			const firstRequest = firstFramework.anonymous({
				requestId: 'parallel-1',
				source: requestSources.rest,
			})
			const secondRequest = secondFramework.user('user-2', {
				requestId: 'parallel-2',
				source: requestSources.graphql,
			})
			const secondOperation = {
				kind: 'find',
				query: new Query(matchingClassSchema).ast,
			} satisfies FindOperationAst<typeof matchingClassSchema>

			const [firstResult, secondResult] = await Promise.all([
				firstRequest.execute(articleOperation),
				secondRequest.execute(secondOperation),
			])

			expect(firstResult).toStrictEqual([{ title: 'first' }])
			expect(secondResult).toStrictEqual([{ title: 'second' }])
			expect(firstContexts).toStrictEqual([firstRequest.context])
			expect(secondContexts).toStrictEqual([secondRequest.context])
			expect(() => firstRequest.query(matchingClassSchema)).toThrow(
				FrameworkError,
			)
			expect(() => secondRequest.query(articleSchema)).toThrow(FrameworkError)
		},
	)

	it('rejects malformed low-level JavaScript assembly', () => {
		const framework = createFixtureFramework(articleSchema)
		const pipeline = createPipeline(new FixtureDatabaseExecutor([]))

		expect(
			() =>
				// @ts-expect-error -- Runtime validation protects JavaScript assembly.
				new FrameworkEngine([]),
		).toThrow(new TypeError('Framework engine options must be a plain object'))
		expect(
			() =>
				// @ts-expect-error -- Runtime validation requires an application.
				new FrameworkEngine({}),
		).toThrow(
			new TypeError(
				'Framework engine application must be a FrameworkApplication',
			),
		)
		expect(
			() =>
				// @ts-expect-error -- Runtime validation requires a pipeline.
				new FrameworkEngine({ application: framework.application }),
		).toThrow(
			new TypeError('Framework engine pipeline must be a RuntimePipeline'),
		)
		expect(() =>
			// @ts-expect-error -- Runtime validation protects JavaScript contexts.
			framework.withContext(undefined),
		).toThrow(
			new TypeError('Framework engine context must be a RequestContext'),
		)
		expect(
			() =>
				new RequestEngine(
					// @ts-expect-error -- External code cannot produce the construction key.
					Symbol('forged'),
					framework,
					RequestContext.anonymous({
						requestId: 'forged-1',
						source: requestSources.internal,
					}),
					pipeline,
				),
		).toThrow(
			new TypeError('Request engines must be created by their FrameworkEngine'),
		)
	})
})
