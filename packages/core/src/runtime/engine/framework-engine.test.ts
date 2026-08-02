import { FrameworkApplication, FrameworkError } from '../../foundation.js'
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
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '../database/contracts.js'
import { MasterAuthority } from '../master/master-authority.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine, RequestEngine } from './framework-engine.js'

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const matchingClassSchema = new Schema({
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
		const request = framework.user('operator-1', {
			requestId: 'master-1',
			source: requestSources.internal,
		})
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
		expect(events).toStrictEqual([
			{
				keyId: 'maintenance',
				kind: 'master-access',
				occurredAt: '2026-08-01T03:00:00.000Z',
				previousAccess: { mode: 'user', userId: 'operator-1' },
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
