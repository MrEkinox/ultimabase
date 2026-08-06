import { FrameworkApplication, FrameworkError } from '../../foundation.js'
import { RequestContextValue } from '../../access/index.js'
import {
	Query,
	type CreateOneOperationAst,
	type FindOperationAst,
} from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseAdapter,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import { MasterAuthority } from '../master/master-authority.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine, RequestEngine } from './framework-engine.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const matchingClassSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const principalValue = new RequestContextValue<string>(
	'fixture.principal',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture principal must be a string')
		}

		return value
	},
)

const articleOperation = {
	kind: 'find',
	query: new Query(articleSchema).limit(10).ast,
} satisfies FindOperationAst<typeof articleSchema>

/** Produces complete records for the strict public result boundary. */
const articleRecord = (title: string) => ({
	createdAt: '2026-08-02T00:00:00.000Z',
	id: '0198f090-2a50-7000-8000-000000000032',
	title,
	updatedAt: '2026-08-02T00:00:00.000Z',
})

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
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> =>
				Promise.resolve(
					createPreparedOperationFixture({
						execute: () => this.execute(request),
					}),
				),
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

/** Creates the policy-free stages needed to exercise the real pipeline. */
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
	masterAuthority?: MasterAuthority,
): FrameworkEngine<readonly [typeof schema], readonly []> => {
	const application = new FrameworkApplication({
		schemas: [schema],
		plugins: [],
	})

	return new FrameworkEngine({
		application,
		...(masterAuthority === undefined ? {} : { masterAuthority }),
		pipeline: createPipeline(
			new FixtureDatabaseExecutor(fixtureResult),
			contexts,
		),
	})
}

describe('FrameworkEngine', () => {
	it('binds immutable anonymous and plugin-derived request contexts', () => {
		const framework = createFixtureFramework(articleSchema)
		const anonymous = framework.anonymous({
			requestId: 'anonymous-1',
			source: requestSources.rest,
		})
		const scopedContext = RequestContext.anonymous({
			requestId: 'user-1',
			source: requestSources.graphql,
		}).withValue(principalValue, 'user-1')
		const scoped = framework.withContext(scopedContext)

		expect(anonymous).toBeInstanceOf(RequestEngine)
		expect(anonymous.application).toBe(framework.application)
		expect(anonymous.framework).toBe(framework)
		expect(anonymous.context.access).toStrictEqual({ mode: 'anonymous' })
		expect(scoped.context.access).toStrictEqual({ mode: 'anonymous' })
		expect(scoped.context.getValue(principalValue)).toBe('user-1')
		expect(Object.isFrozen(framework)).toBe(true)
		expect(Object.isFrozen(scoped)).toBe(true)
	})

	it('validates immutable query ownership only when a terminal executes', async () => {
		const framework = createFixtureFramework(articleSchema)
		const request = framework.anonymous({
			requestId: 'query-1',
			source: requestSources.internal,
		})
		const query = articleSchema
			.query()
			.where((where) => where.eq('title', 'UltimaBase'))
		const foreignOperation = {
			kind: 'find',
			query: matchingClassSchema.query().ast,
		} satisfies FindOperationAst<typeof matchingClassSchema>

		expect('engine' in query).toBe(false)
		expect(query.schema).toBe(articleSchema)
		expect(query.ast.where).toBeDefined()
		await expect(request.execute(foreignOperation)).rejects.toStrictEqual(
			new FrameworkError(
				'VALIDATION_ERROR',
				'Schema does not belong to this application: Article',
				{
					publicMessage: 'The requested schema is not available.',
					internalDetails: { className: 'Article' },
				},
			),
		)
	})

	it('executes normalized operations with the exact request context', async () => {
		const contexts: RequestContext[] = []
		const articles = [articleRecord('UltimaBase')]
		const framework = createFixtureFramework(articleSchema, articles, contexts)
		const request = framework.anonymous({
			requestId: 'execute-1',
			source: requestSources.internal,
		})

		const result = await request.execute(articleOperation)

		expect(result).toHaveLength(1)
		expect(result[0]).toBeInstanceOf(articleSchema)
		expect(result[0]?.toJSON()).toStrictEqual(articles[0])
		expect(contexts).toStrictEqual([request.context])

		const foreignOperation = {
			kind: 'find',
			query: new Query(matchingClassSchema).ast,
		} satisfies FindOperationAst<typeof matchingClassSchema>

		await expect(request.execute(foreignOperation)).rejects.toBeInstanceOf(
			FrameworkError,
		)
		for (const invalidOperation of [
			null,
			{},
			{ schema: { kind: 'invalid', definition: articleSchema } },
			{ schema: { kind: 'schema' } },
		]) {
			await expect(
				// @ts-expect-error -- Runtime validation protects malformed operations.
				request.execute(invalidOperation),
			).rejects.toStrictEqual(
				new FrameworkError(
					'VALIDATION_ERROR',
					'Operation does not contain a normalized schema node.',
					{ publicMessage: 'The operation is invalid.' },
				),
			)
		}
	})

	it('executes schema-backed operations through the same owned pipeline', async () => {
		const createdArticle = articleRecord('Created')
		const framework = createFixtureFramework(articleSchema, createdArticle)
		const request = framework.anonymous({
			requestId: 'create-1',
			source: requestSources.internal,
		})
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new Query(articleSchema).ast.schema,
			input: { title: 'Created' },
		} satisfies CreateOneOperationAst<typeof articleSchema>

		const result = await request.execute(operation)

		expect(result).toBeInstanceOf(articleSchema)
		expect(result.toJSON()).toStrictEqual(createdArticle)
	})

	it('requires adapter transaction support before a mutation pipeline can begin', async () => {
		const contexts: RequestContext[] = []
		const operations: DatabaseOperationAst[] = []
		const executor: DatabaseOperationExecutor = {
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => {
				operations.push(request.operation)
				const emptyReadResult: unknown = []

				// This executor is reached only by the known read operation below.
				return Promise.resolve(
					emptyReadResult as DatabaseOperationResult<TOperation>,
				)
			},
		}
		const framework = new FrameworkEngine({
			application: new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
			pipeline: createPipeline(executor, contexts),
		})
		const request = framework.anonymous({
			requestId: 'missing-transaction-adapter',
			source: requestSources.internal,
		})
		const mutation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new Query(articleSchema).ast.schema,
			input: { title: 'Must not execute' },
		} satisfies CreateOneOperationAst<typeof articleSchema>

		await expect(request.execute(articleOperation)).resolves.toStrictEqual([])
		await expect(request.execute(mutation)).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'database-adapter-required' },
		})
		expect(operations).toStrictEqual([articleOperation])
		expect(contexts).toStrictEqual([request.context])
	})

	it('delegates transaction callbacks without losing request identity', async () => {
		const framework = createFixtureFramework(articleSchema)
		const request = framework.withContext(
			RequestContext.anonymous({
				requestId: 'transaction-1',
				source: requestSources.internal,
			}).withValue(principalValue, 'user-1'),
		)

		await expect(
			request.transaction((transaction) => {
				expect(transaction).not.toBe(request)
				expect(transaction.context).toBe(request.context)
				expect(transaction.context.getValue(principalValue)).toBe('user-1')
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

	it('elevates only authority-owned grants after emitting an audit event', async () => {
		const events: unknown[] = []
		const contexts: RequestContext[] = []
		const authority = new MasterAuthority({
			clock: () => new Date('2026-08-01T03:00:00.000Z'),
			keys: [{ id: 'maintenance', value: 'verified-secret' }],
			onUse: (event) => {
				events.push(event)
			},
		})
		const framework = createFixtureFramework(
			articleSchema,
			[],
			contexts,
			authority,
		)
		const requestContext = RequestContext.anonymous({
			requestId: 'master-1',
			source: requestSources.internal,
		}).withValue(principalValue, 'operator-1')
		const request = framework.withContext(requestContext)
		const grant = framework.authorizeMasterKey('verified-secret')
		const master = await request.useMasterKey(
			grant,
			'backfill verified articles',
		)

		expect(master.context.access).toStrictEqual({
			keyId: 'maintenance',
			mode: 'master',
			reason: 'backfill verified articles',
		})
		expect(master.context.metadata).toStrictEqual(request.context.metadata)
		expect(master.context.getValue(principalValue)).toBe('operator-1')
		expect(events).toStrictEqual([
			{
				keyId: 'maintenance',
				kind: 'master-access',
				occurredAt: '2026-08-01T03:00:00.000Z',
				previousAccess: { mode: 'anonymous' },
				reason: 'backfill verified articles',
				requestId: 'master-1',
				source: 'internal',
			},
		])

		await master.execute(articleOperation)
		expect(contexts).toStrictEqual([master.context])
		await master.transaction(async (transaction) => {
			expect(transaction.context.access.mode).toBe('master')
			await transaction.execute(articleOperation)
		})
	})

	it('rejects raw, forged, and foreign authority input', async () => {
		const unconfiguredFramework = createFixtureFramework(articleSchema)
		const firstAuthority = new MasterAuthority({
			keys: [{ id: 'first', value: 'first-secret' }],
			onUse: () => undefined,
		})
		const secondAuthority = new MasterAuthority({
			keys: [{ id: 'second', value: 'second-secret' }],
			onUse: () => undefined,
		})
		const firstFramework = createFixtureFramework(
			articleSchema,
			[],
			[],
			firstAuthority,
		)
		const secondFramework = createFixtureFramework(
			articleSchema,
			[],
			[],
			secondAuthority,
		)
		const request = secondFramework.anonymous({
			requestId: 'master-forgery',
			source: requestSources.rest,
		})

		expect(() => unconfiguredFramework.authorizeMasterKey('raw-input')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		expect(() => secondFramework.authorizeMasterKey('first-secret')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		await expect(
			request.useMasterKey(
				firstFramework.authorizeMasterKey('first-secret'),
				'foreign grant',
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			request.useMasterKey({ keyId: 'second' } as never, 'forged grant'),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it.concurrent(
		'isolates parallel applications even when schemas share a class name',
		async () => {
			const firstContexts: RequestContext[] = []
			const secondContexts: RequestContext[] = []
			const firstFramework = createFixtureFramework(
				articleSchema,
				[articleRecord('first')],
				firstContexts,
			)
			const secondFramework = createFixtureFramework(
				matchingClassSchema,
				[articleRecord('second')],
				secondContexts,
			)
			const firstRequest = firstFramework.anonymous({
				requestId: 'parallel-1',
				source: requestSources.rest,
			})
			const secondRequest = secondFramework.anonymous({
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

			expect(firstResult[0]).toBeInstanceOf(articleSchema)
			expect(secondResult[0]).toBeInstanceOf(matchingClassSchema)
			expect(firstResult[0]?.toJSON()).toStrictEqual(articleRecord('first'))
			expect(secondResult[0]?.toJSON()).toStrictEqual(articleRecord('second'))
			expect(firstContexts).toStrictEqual([firstRequest.context])
			expect(secondContexts).toStrictEqual([secondRequest.context])
			await expect(
				firstRequest.execute(secondOperation),
			).rejects.toBeInstanceOf(FrameworkError)
			await expect(
				secondRequest.execute(articleOperation),
			).rejects.toBeInstanceOf(FrameworkError)
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
		expect(
			() =>
				new FrameworkEngine({
					application: framework.application,
					// @ts-expect-error -- Runtime validation rejects forged authority objects.
					masterAuthority: {},
					pipeline,
				}),
		).toThrow(
			new TypeError(
				'Framework engine masterAuthority must be a MasterAuthority',
			),
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
