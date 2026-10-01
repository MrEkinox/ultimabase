import { applicationFixture } from '../../../tests/application-fixture.js'
import { FrameworkError } from '../../foundation.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import {
	RequestContextValue,
	type MasterRequestAccess,
} from '../../access/index.js'
import {
	QueryBuilder,
	type CreateOneOperationAst,
	type FindManyOperationAst,
} from '../../query/index.js'

import { describe, expect, it } from 'vitest'

import {
	RequestContext,
	requestSources,
	type RequestContextOptions,
} from '../context/request-context.js'
import {
	readRequestEngineApplication,
	readRequestEngineFramework,
} from './request-engine.js'
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
import { databasePersistencePlanCapability } from '../database/contracts.js'
import {
	elevateMasterRequest,
	MasterAuthority,
} from '../master/master-authority.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine, RequestEngine } from './framework-engine.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from '../application/ultima-base.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const matchingClassSchema = UltimaBase.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
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
	kind: 'find-many',
	query: new QueryBuilder(articleSchema).limit(10).ast,
} satisfies FindManyOperationAst<typeof articleSchema>

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
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
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
			capabilities: this.capabilities,
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
		finalMutationValidation: (input) => input.operation,
		databaseOperation,
		commit: () => undefined,
	}

	return new RuntimePipeline(stages)
}

const createFixtureFramework = async (
	schema: typeof articleSchema,
	fixtureResult: unknown = [],
	contexts: RequestContext[] = [],
	masterAuthority?: MasterAuthority,
): Promise<FrameworkEngine<readonly [typeof schema], readonly []>> => {
	const application = await applicationFixture(
		new FrameworkApplication({
			schemas: [schema],
			plugins: [],
		}),
	).initialize()

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
	it('binds immutable anonymous and plugin-derived request contexts', async () => {
		const framework = await createFixtureFramework(articleSchema)
		const anonymous = framework.anonymous({
			requestId: 'anonymous-1',
			source: 'fixture.anonymous',
		})
		const scopedContext = RequestContext.anonymous({
			requestId: 'user-1',
			source: 'fixture.scoped',
		}).withValue(principalValue, 'user-1')
		const scoped = framework.withContext(scopedContext)

		expect(anonymous).toBeInstanceOf(RequestEngine)
		expect(readRequestEngineApplication(anonymous)).toBe(framework.application)
		expect(readRequestEngineFramework(anonymous)).toBe(framework)
		expect(anonymous.context.access).toStrictEqual({ mode: 'anonymous' })
		expect(scoped.context.access).toStrictEqual({ mode: 'anonymous' })
		expect(scoped.context.getValue(principalValue)).toBe('user-1')
		expect(Object.isFrozen(framework)).toBe(true)
		expect(Object.isFrozen(scoped)).toBe(true)
	})

	it('validates immutable query ownership only when a terminal executes', async () => {
		const framework = await createFixtureFramework(articleSchema)
		const request = framework.anonymous({
			requestId: 'query-1',
			source: requestSources.internal,
		})
		const query = new QueryBuilder(articleSchema).where((where) =>
			where.eq('title', 'UltimaBase'),
		)
		const foreignOperation = {
			kind: 'find-many',
			query: new QueryBuilder(matchingClassSchema).ast,
		} satisfies FindManyOperationAst<typeof matchingClassSchema>

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
		const framework = await createFixtureFramework(
			articleSchema,
			articles,
			contexts,
		)
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
			kind: 'find-many',
			query: new QueryBuilder(matchingClassSchema).ast,
		} satisfies FindManyOperationAst<typeof matchingClassSchema>

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
		const framework = await createFixtureFramework(
			articleSchema,
			createdArticle,
		)
		const request = framework.anonymous({
			requestId: 'create-1',
			source: requestSources.internal,
		})
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
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
			capabilities: { persistencePlans: databasePersistencePlanCapability },
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
			application: await applicationFixture(
				new FrameworkApplication({
					schemas: [articleSchema],
					plugins: [],
				}),
			).initialize(),
			pipeline: createPipeline(executor, contexts),
		})
		const request = framework.anonymous({
			requestId: 'missing-transaction-adapter',
			source: requestSources.internal,
		})
		const mutation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(articleSchema).ast.schema,
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
		const framework = await createFixtureFramework(articleSchema)
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
				expect(readRequestEngineFramework(transaction)).toBe(
					readRequestEngineFramework(request),
				)

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
		const framework = await createFixtureFramework(
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
		const unconfiguredFramework = await createFixtureFramework(articleSchema)
		expect(() => unconfiguredFramework.authorizeMasterKey('raw-input')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		await unconfiguredFramework.application.dispose()

		const firstAuthority = new MasterAuthority({
			keys: [{ id: 'first', value: 'first-secret' }],
			onUse: () => undefined,
		})
		const secondAuthority = new MasterAuthority({
			keys: [{ id: 'second', value: 'second-secret' }],
			onUse: () => undefined,
		})
		const firstFramework = await createFixtureFramework(
			articleSchema,
			[],
			[],
			firstAuthority,
		)
		const foreignGrant = firstFramework.authorizeMasterKey('first-secret')
		await firstFramework.application.dispose()

		const secondFramework = await createFixtureFramework(
			articleSchema,
			[],
			[],
			secondAuthority,
		)
		const request = secondFramework.anonymous({
			requestId: 'master-forgery',
			source: 'fixture.foreign',
		})

		expect(() => secondFramework.authorizeMasterKey('first-secret')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		await expect(
			request.useMasterKey(foreignGrant, 'foreign grant'),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			request.useMasterKey({ keyId: 'second' } as never, 'forged grant'),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('rejects every master context not issued by its exact application authority', async () => {
		const configuredAuthority = new MasterAuthority({
			keys: [{ id: 'configured', value: 'configured-secret' }],
			onUse: () => undefined,
		})
		const foreignAuthority = new MasterAuthority({
			keys: [{ id: 'foreign', value: 'foreign-secret' }],
			onUse: () => undefined,
		})
		const configured = await createFixtureFramework(
			articleSchema,
			[],
			[],
			configuredAuthority,
		)
		const source = RequestContext.anonymous({
			requestId: 'foreign-authority-context',
			source: requestSources.internal,
		})
		configured.withContext(source)
		const foreignMaster = await elevateMasterRequest(
			foreignAuthority,
			foreignAuthority.authorize('foreign-secret'),
			source,
			'foreign authority fixture',
			configured.application,
		)
		const ContextConstructor = RequestContext as unknown as new (
			access: MasterRequestAccess,
			options: RequestContextOptions,
		) => RequestContext<MasterRequestAccess>
		const structuralLookalike = new ContextConstructor(
			{
				keyId: 'configured',
				mode: 'master',
				reason: 'structural lookalike',
			},
			{
				requestId: 'structural-master-context',
				source: requestSources.internal,
			},
		)

		for (const context of [foreignMaster, structuralLookalike]) {
			expect(() => configured.withContext(context)).toThrow(
				expect.objectContaining({
					code: 'PERMISSION_DENIED',
					internalDetails: {
						reason: 'master-context-provenance-mismatch',
					},
				}),
			)
		}
	})

	it('isolates master contexts and grants across replacement with one authority', async () => {
		const audits: unknown[] = []
		const authority = new MasterAuthority({
			keys: [{ id: 'shared', value: 'shared-secret' }],
			onUse: (event) => {
				audits.push(event)
			},
		})
		const first = await createFixtureFramework(articleSchema, [], [], authority)
		const firstRequest = first.anonymous({
			requestId: 'first',
			source: 'fixture',
		})
		const oldGrant = first.authorizeMasterKey('shared-secret')
		const firstMaster = await firstRequest.useMasterKey(
			oldGrant,
			'first elevation',
		)
		const unusedOldGrant = first.authorizeMasterKey('shared-secret')
		await first.application.dispose()
		const contexts: RequestContext[] = []
		const second = await createFixtureFramework(
			articleSchema,
			[],
			contexts,
			authority,
		)
		const secondRequest = second.anonymous({
			requestId: 'second',
			source: 'fixture',
		})
		for (const context of [
			firstMaster.context,
			firstMaster.context.withValue(principalValue, 'old'),
		]) {
			expect(() => second.withContext(context)).toThrow(
				expect.objectContaining({ code: 'PERMISSION_DENIED' }),
			)
		}
		for (const grant of [oldGrant, unusedOldGrant]) {
			await expect(
				secondRequest.useMasterKey(grant, 'foreign grant'),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		}
		const secondMaster = await secondRequest.useMasterKey(
			second.authorizeMasterKey('shared-secret'),
			'second elevation',
		)
		await second.withContext(secondMaster.context).execute(articleOperation)
		expect(audits).toHaveLength(2)
		expect(contexts).toStrictEqual([secondMaster.context])
	})

	it('isolates sequential applications even when schemas share a class name', async () => {
		const firstContexts: RequestContext[] = []
		const secondContexts: RequestContext[] = []
		const firstFramework = await createFixtureFramework(
			articleSchema,
			[articleRecord('first')],
			firstContexts,
		)
		const firstRequest = firstFramework.anonymous({
			requestId: 'parallel-1',
			source: 'fixture.first',
		})
		const firstResult = await firstRequest.execute(articleOperation)
		await expect(
			firstRequest.execute({
				kind: 'find-many',
				query: new QueryBuilder(matchingClassSchema).ast,
			}),
		).rejects.toBeInstanceOf(FrameworkError)
		await firstFramework.application.dispose()
		const secondFramework = await createFixtureFramework(
			matchingClassSchema,
			[articleRecord('second')],
			secondContexts,
		)
		const secondRequest = secondFramework.anonymous({
			requestId: 'parallel-2',
			source: 'fixture.second',
		})
		const secondOperation = {
			kind: 'find-many',
			query: new QueryBuilder(matchingClassSchema).ast,
		} satisfies FindManyOperationAst<typeof matchingClassSchema>

		const secondResult = await secondRequest.execute(secondOperation)

		expect(firstResult[0]).toBeInstanceOf(articleSchema)
		expect(secondResult[0]).toBeInstanceOf(matchingClassSchema)
		expect(firstResult[0]?.toJSON()).toStrictEqual(articleRecord('first'))
		expect(secondResult[0]?.toJSON()).toStrictEqual(articleRecord('second'))
		expect(firstContexts).toStrictEqual([firstRequest.context])
		expect(secondContexts).toStrictEqual([secondRequest.context])
		await expect(firstRequest.execute(secondOperation)).rejects.toThrow(
			'initialized active application',
		)
		await expect(
			secondRequest.execute(articleOperation),
		).rejects.toBeInstanceOf(FrameworkError)
	})

	it('rejects malformed low-level JavaScript assembly', async () => {
		const framework = await createFixtureFramework(articleSchema)
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
